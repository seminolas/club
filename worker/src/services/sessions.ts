// Sessions for the new UI (UI-PORT.md, U2 onwards).
import * as db from '../db'
import type { SessionStatus } from '../types'
import { cachedByVersion } from './cache'
import { CLUB_ID, ServiceError, requireAdmin } from './context'
import type { ServiceContext } from './context'

export interface SessionListRow {
  date: string
  status: SessionStatus
  playerCount: number
  /** Everyone marked as attending, for searching by player. */
  players: string[]
}

/** Every session, newest first, with who attended. */
export async function sessionList(
  ctx: ServiceContext,
): Promise<SessionListRow[]> {
  const [version, openSessions, open] = await Promise.all([
    db.closedSessionsVersion(ctx.db, CLUB_ID),
    // Sessions still open change all the time; they're few and small.
    db.listSessions(ctx.db, CLUB_ID, false),
    db.sessionAttendeeNames(ctx.db, CLUB_ID, false),
  ])
  // Closed sessions read every attendee row: cached until one closes,
  // re-opens or is deleted.
  const [closedSessions, closed] = await cachedByVersion(
    `sessions:${CLUB_ID}`,
    version,
    () =>
      Promise.all([
        db.listSessions(ctx.db, CLUB_ID, true),
        db.sessionAttendeeNames(ctx.db, CLUB_ID, true),
      ]),
  )
  const sessions = [...openSessions, ...closedSessions].sort((a, b) =>
    b.date.localeCompare(a.date),
  )
  const names = new Map<string, string[]>()
  for (const { date, name } of [...closed, ...open])
    names.set(date, [...(names.get(date) ?? []), name])
  return sessions.map((s) => ({
    date: s.date,
    status: s.status,
    playerCount: s.attendee_count,
    players: names.get(s.date) ?? [],
  }))
}

/** A new session for a date (admins), with the current ladder as its "before". */
export async function createSession(ctx: ServiceContext, date: string) {
  await requireAdmin(ctx)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ServiceError('Invalid date', 400)
  const existing = await db.getSessionByDate(ctx.db, CLUB_ID, date)
  if (existing) throw new ServiceError('Session already exists', 409)

  // Fetch leaderboard BEFORE creating the session — after creation the new
  // session becomes the most recent, making getLeaderboardPlayers return nothing.
  const players = await db.getLeaderboardPlayers(ctx.db, CLUB_ID)

  const sessionId = await db.createSession(ctx.db, CLUB_ID, date)
  await db.setSessionRanks(
    ctx.db,
    sessionId,
    players.map((p) => p.id),
    'before',
  )

  return {
    date,
    status: 'attendance' as const,
    attendees: [],
    boxes: [],
    leaderboardBefore: players.map((p) => ({ id: p.id, name: p.name })),
    leaderboardAfter: null,
  }
}
