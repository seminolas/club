// A session night: reading it, and the admin moves through it (check-in,
// boxes, close, re-open, delete, adding a player) and anyone's check-in
// (V2). Shared by the API routes and the new UI. Every change tells the
// session's screens: a check-in as itself, anything else as "reload" (live
// channel, S6a).
import * as db from '../db'
import type { BoxInput, SessionResponse } from '../types'
import type { ServerMessage } from '../live-core'
import { ServiceError, requireAdmin, signedIn } from './context'
import { pairsProblem } from '../domain/matches'
import type { ServiceContext } from './context'
import { skillChangedFrom } from './skill'

/** The session's live room (one per club + date), if there is one. */
export const sessionRoom = (ctx: ServiceContext, date: string) =>
  ctx.env.SESSION_ROOM?.get(
    ctx.env.SESSION_ROOM.idFromName(`${ctx.club.id}:${date}`),
  )

/**
 * Tell the session's screens: `message`, or by default "reload the session".
 * Never fails the change itself.
 */
export async function notifyLive(
  ctx: ServiceContext,
  date: string,
  message?: ServerMessage,
) {
  await sessionRoom(ctx, date)
    ?.fetch('https://live/notify', {
      method: 'POST',
      body: message ? JSON.stringify(message) : undefined,
    })
    .catch((err: unknown) => console.error('live notify failed', err))
}

async function session(ctx: ServiceContext, date: string) {
  const s = await db.getSessionByDate(ctx.db, ctx.club.id, date)
  if (!s) throw new ServiceError('Not found', 404)
  return s
}

/** Admins only; the admin's own player, for the check-in audit. */
async function actingAdmin(ctx: ServiceContext) {
  const userId = await requireAdmin(ctx)
  return (await db.getPlayerByUserId(ctx.db, ctx.club.id, userId))?.id ?? null
}

/**
 * Anyone signed in with a player (V2: players mark themselves and others);
 * admins also without one. Their player, for the check-in audit.
 */
async function actingPlayer(ctx: ServiceContext) {
  const auth = await signedIn(ctx)
  if (!auth) throw new ServiceError('Sign in to mark who’s coming', 401)
  const player = await db.getPlayerByUserId(ctx.db, ctx.club.id, auth.user.id)
  const isAdmin = auth.user.role === 'admin'
  if (!isAdmin && !player) throw new ServiceError('Pick your player first', 403)
  return { id: player?.id ?? null, isAdmin }
}

/** Everything about one session (public). */
export async function getSession(
  ctx: ServiceContext,
  date: string,
): Promise<SessionResponse> {
  const s = await session(ctx, date)
  const [lbBefore, lbAfter, attendees, checkIns, boxes] = await Promise.all([
    db.getSessionRanks(ctx.db, s.id, 'before'),
    s.status === 'closed'
      ? db.getSessionRanks(ctx.db, s.id, 'after')
      : Promise.resolve(null),
    db.getAttendees(ctx.db, s.id),
    db.getCheckIns(ctx.db, s.id),
    db.getBoxes(ctx.db, s.id),
  ])
  return {
    date: s.date,
    status: s.status,
    attendees,
    checkIns,
    boxes,
    leaderboardBefore: lbBefore,
    leaderboardAfter: lbAfter,
  }
}

export async function setAttendance(
  ctx: ServiceContext,
  date: string,
  playerId: number,
  attending: boolean,
) {
  const by = await actingPlayer(ctx)
  const s = await session(ctx, date)
  if (s.status === 'games' || s.status === 'closed')
    throw new ServiceError('Cannot change attendance in this state', 400)
  const player = await db.getPlayerById(ctx.db, ctx.club.id, playerId)
  if (!player) throw new ServiceError('Player not found', 404)
  // Players mark from the ladder; someone new is added by an admin.
  if (!by.isAdmin && !(await db.isOnSessionLadder(ctx.db, s.id, playerId)))
    throw new ServiceError('Not on this session’s ladder: ask an admin', 400)
  await db.setAttendance(ctx.db, s.id, playerId, attending, by.id)
  // The player's latest change (an older one if this changed nothing).
  const checkIn = (await db.getCheckIns(ctx.db, s.id, playerId)).at(-1) ?? null
  // Just this player's row on every screen, not a reload of the session.
  const change = {
    player: { id: player.id, name: player.name },
    attending,
    checkIn,
  }
  await notifyLive(ctx, date, { type: 'attendance', ...change })
  return change
}

/** Save the boxes (player ids) and start play. */
export async function saveBoxes(
  ctx: ServiceContext,
  date: string,
  boxes: BoxInput[],
) {
  await requireAdmin(ctx)
  const s = await session(ctx, date)
  if (s.status === 'closed') throw new ServiceError('Session is closed', 400)
  boxes.forEach((box, bi) =>
    box.matches.forEach((m, mi) => {
      const problem = pairsProblem(box.players, m.pairs)
      if (problem)
        throw new ServiceError(
          `Box ${bi + 1}, match ${mi + 1}: ${problem}`,
          400,
        )
    }),
  )
  await db.clearBoxes(ctx.db, s.id)
  await db.saveBoxes(ctx.db, s.id, boxes)
  await db.updateSessionStatus(ctx.db, s.id, 'games')
  await notifyLive(ctx, date)
}

/** Close the session with the ladder after it (player ids, best first). */
export async function closeSession(
  ctx: ServiceContext,
  date: string,
  ladderAfter: number[],
) {
  await requireAdmin(ctx)
  const s = await session(ctx, date)
  await db.setSessionRanks(ctx.db, s.id, ladderAfter, 'after')
  await db.updateSessionStatus(ctx.db, s.id, 'closed', new Date().toISOString())
  await skillChangedFrom(ctx, date)
  await notifyLive(ctx, date)
}

/** Closed → playing again. */
export async function reopenSession(ctx: ServiceContext, date: string) {
  await requireAdmin(ctx)
  const s = await session(ctx, date)
  if (s.status !== 'closed')
    throw new ServiceError('Session is not closed', 400)
  await db.updateSessionStatus(ctx.db, s.id, 'games')
  await skillChangedFrom(ctx, date)
  await notifyLive(ctx, date)
}

/** Playing → check-in again; the boxes and their scores are deleted. */
export async function reopenAttendance(ctx: ServiceContext, date: string) {
  await requireAdmin(ctx)
  const s = await session(ctx, date)
  if (s.status !== 'games')
    throw new ServiceError('Session is not in games state', 400)
  await db.clearBoxes(ctx.db, s.id)
  await db.updateSessionStatus(ctx.db, s.id, 'attendance')
  await notifyLive(ctx, date)
}

export async function deleteSession(ctx: ServiceContext, date: string) {
  await requireAdmin(ctx)
  const s = await session(ctx, date)
  await db.deleteSession(ctx.db, s.id)
  if (s.status === 'closed') await skillChangedFrom(ctx, date)
  await notifyLive(ctx, date)
}

/**
 * A new player, at a ladder position, marked as coming (check-in only). The
 * new UI also sets their display name.
 */
export async function addPlayer(
  ctx: ServiceContext,
  input: {
    name: string
    insertRank: number
    date: string
    preferredName?: string | null
  },
) {
  const by = await actingAdmin(ctx)
  const { name, insertRank, date } = input
  if (!name || !insertRank || !date)
    throw new ServiceError('name, insert_rank, session_date required', 400)
  const s = await db.getSessionByDate(ctx.db, ctx.club.id, date)
  if (!s) throw new ServiceError('Session not found', 404)
  if (s.status === 'closed') throw new ServiceError('Session is closed', 400)
  if (s.status === 'games')
    throw new ServiceError(
      'Cannot add players during games — re-open attendance first',
      400,
    )
  if (await db.getPlayerByName(ctx.db, ctx.club.id, name))
    throw new ServiceError('Player already exists', 409)
  const id = await db.addPlayerMidSession(
    ctx.db,
    ctx.club.id,
    s.id,
    name,
    insertRank,
    by,
  )
  if (input.preferredName)
    await db.updatePlayerProfile(ctx.db, id, {
      preferred_name: input.preferredName,
    })
  await notifyLive(ctx, date)
  return id
}
