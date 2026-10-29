// A session night: reading it, and the admin moves through it (check-in,
// boxes, close, re-open, delete, adding a player). Shared by the API routes
// and the new UI. Every change tells the session's screens to reload (live
// channel, S6a).
import * as db from '../db'
import type { BoxInput, SessionResponse } from '../types'
import { CLUB_ID, ServiceError, requireAdmin } from './context'
import { pairsProblem } from '../domain/matches'
import type { ServiceContext } from './context'
import { skillChangedFrom } from './skill'

/** The session's live room (one per club + date), if there is one. */
export const sessionRoom = (ctx: ServiceContext, date: string) =>
  ctx.env.SESSION_ROOM?.get(
    ctx.env.SESSION_ROOM.idFromName(`${CLUB_ID}:${date}`),
  )

/** Tell the session's screens to reload; never fails the change itself. */
export async function notifyLive(ctx: ServiceContext, date: string) {
  await sessionRoom(ctx, date)
    ?.fetch('https://live/notify', { method: 'POST' })
    .catch((err: unknown) => console.error('live notify failed', err))
}

async function session(ctx: ServiceContext, date: string) {
  const s = await db.getSessionByDate(ctx.db, CLUB_ID, date)
  if (!s) throw new ServiceError('Not found', 404)
  return s
}

/** Admins only; the admin's own player, for the check-in audit. */
async function actingAdmin(ctx: ServiceContext) {
  const userId = await requireAdmin(ctx)
  return (await db.getPlayerByUserId(ctx.db, CLUB_ID, userId))?.id ?? null
}

/** Everything about one session (public). */
export async function getSession(
  ctx: ServiceContext,
  date: string,
): Promise<SessionResponse> {
  const s = await session(ctx, date)
  const [lbBefore, lbAfter, attendees, boxes] = await Promise.all([
    db.getSessionRanks(ctx.db, s.id, 'before'),
    s.status === 'closed'
      ? db.getSessionRanks(ctx.db, s.id, 'after')
      : Promise.resolve(null),
    db.getAttendees(ctx.db, s.id),
    db.getBoxes(ctx.db, s.id),
  ])
  return {
    date: s.date,
    status: s.status,
    attendees,
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
  const by = await actingAdmin(ctx)
  const s = await session(ctx, date)
  if (s.status === 'games' || s.status === 'closed')
    throw new ServiceError('Cannot change attendance in this state', 400)
  await db.setAttendance(ctx.db, s.id, playerId, attending, by)
  await notifyLive(ctx, date)
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
  const s = await db.getSessionByDate(ctx.db, CLUB_ID, date)
  if (!s) throw new ServiceError('Session not found', 404)
  if (s.status === 'closed') throw new ServiceError('Session is closed', 400)
  if (s.status === 'games')
    throw new ServiceError(
      'Cannot add players during games — re-open attendance first',
      400,
    )
  if (await db.getPlayerByName(ctx.db, CLUB_ID, name))
    throw new ServiceError('Player already exists', 409)
  const id = await db.addPlayerMidSession(
    ctx.db,
    CLUB_ID,
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
