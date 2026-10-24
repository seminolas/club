// D1 queries, via Drizzle.

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  ne,
  notExists,
  sql,
} from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as t from './db/schema'
import { getPairings, SUPPORTED_BOX_SIZES } from './domain/pairings'
import type { Box, BoxInput, Match, SessionStatus } from './types'

// Accepts either a plain D1Database or a D1DatabaseSession (see index.ts's
// withSession('first-primary') wrapper) — both expose prepare()/batch().
export type DB = Pick<D1Database, 'prepare' | 'batch'>

// Drizzle over the same connection (Drizzle only needs prepare()/batch()).
const orms = new WeakMap<DB, DrizzleD1Database<typeof t>>()
export function orm(db: DB): DrizzleD1Database<typeof t> {
  let o = orms.get(db)
  if (!o) {
    o = drizzle(db as D1Database, { schema: t })
    orms.set(db, o)
  }
  return o
}

type Query = BatchItem<'sqlite'>

// Runs the statements atomically (one D1 batch). Many-row writes are one
// statement per row: D1 allows at most 100 bound parameters per statement.
async function runBatch(db: DB, queries: Query[]): Promise<void> {
  if (queries.length === 0) return
  await orm(db).batch(queries as [Query, ...Query[]])
}

// ── Leaderboard / session_ranks ───────────────────────────────────────────────

// Returns players ordered by their rank in the most recent session (or seed if none).
export async function getLeaderboardPlayers(
  db: DB,
  clubId: number,
): Promise<
  {
    id: number
    name: string
    hc_member_id: string | null
    preferred_name: string | null
  }[]
> {
  const latestSession = orm(db)
    .select({ id: t.sessions.id })
    .from(t.sessions)
    .where(eq(t.sessions.clubId, clubId))
    .orderBy(desc(t.sessions.date))
    .limit(1)
  return orm(db)
    .select({
      id: t.players.id,
      name: t.players.name,
      hc_member_id: t.players.hcMemberId,
      preferred_name: t.players.preferredName,
    })
    .from(t.players)
    .innerJoin(t.sessionRanks, eq(t.sessionRanks.playerId, t.players.id))
    .leftJoin(t.sessions, eq(t.sessions.id, t.sessionRanks.sessionId))
    .where(
      and(
        eq(t.players.clubId, clubId),
        isNull(t.players.archivedAt),
        // IS: also matches the seed rows (NULL) when there are no sessions.
        sql`${t.sessionRanks.sessionId} IS (${latestSession})`,
        // An open session's ladder is its 'before'; a closed one's its 'after'.
        sql`${t.sessionRanks.phase} = CASE WHEN COALESCE(${t.sessions.status}, 'closed') = 'closed' THEN 'after' ELSE 'before' END`,
      ),
    )
    .orderBy(asc(t.sessionRanks.rankPosition))
}

export async function getPlayerByName(
  db: DB,
  clubId: number,
  name: string,
): Promise<{ id: number; name: string } | null> {
  const row = await orm(db)
    .select({ id: t.players.id, name: t.players.name })
    .from(t.players)
    .where(
      and(
        eq(t.players.clubId, clubId),
        eq(t.players.name, name),
        isNull(t.players.archivedAt),
      ),
    )
    .get()
  return row ?? null
}

// Get ranked players for a given session_id and phase.
// Seed rows (session_id = null) have no phase distinction — all are returned.
export async function getSessionRanks(
  db: DB,
  sessionId: number | null,
  phase: 'before' | 'after' = 'after',
): Promise<{ id: number; name: string }[]> {
  return orm(db)
    .select({ id: t.players.id, name: t.players.name })
    .from(t.sessionRanks)
    .innerJoin(t.players, eq(t.players.id, t.sessionRanks.playerId))
    .where(
      sessionId === null
        ? isNull(t.sessionRanks.sessionId)
        : and(
            eq(t.sessionRanks.sessionId, sessionId),
            eq(t.sessionRanks.phase, phase),
          ),
    )
    .orderBy(asc(t.sessionRanks.rankPosition))
}

// Replace all session_ranks rows for a given session_id and phase.
// Seed rows (session_id = null) are always phase 'after' — all seed rows are replaced.
export async function setSessionRanks(
  db: DB,
  sessionId: number | null,
  playerIds: number[],
  phase: 'before' | 'after' = 'after',
): Promise<void> {
  if (playerIds.length === 0) return
  const d = orm(db)
  await runBatch(db, [
    d
      .delete(t.sessionRanks)
      .where(
        sessionId === null
          ? isNull(t.sessionRanks.sessionId)
          : and(
              eq(t.sessionRanks.sessionId, sessionId),
              eq(t.sessionRanks.phase, phase),
            ),
      ),
    ...playerIds.map((playerId, i) =>
      d
        .insert(t.sessionRanks)
        .values({ sessionId, playerId, rankPosition: i + 1, phase }),
    ),
  ])
}

// Replace the full leaderboard: re-rank all listed players, archive omitted ones.
// Writes through to both seed rows and the most recent session's ranks so the
// live leaderboard reflects the import immediately.
export async function replaceLeaderboard(
  db: DB,
  clubId: number,
  names: string[],
): Promise<void> {
  const d = orm(db)
  // Build name → lowest-id map across all players (including archived).
  // Lowest id = the "original" record; duplicates created by past buggy imports stay archived.
  const allPlayers = await d
    .select({ id: t.players.id, name: t.players.name })
    .from(t.players)
    .where(eq(t.players.clubId, clubId))
    .orderBy(asc(t.players.id))
  const existingByName = new Map<string, number>()
  for (const p of allPlayers) {
    if (!existingByName.has(p.name)) existingByName.set(p.name, p.id)
  }

  // Archive everyone active, then unarchive existing players by id or insert new ones.
  const queries: Query[] = [
    d
      .update(t.players)
      .set({ archivedAt: sql`date('now')` })
      .where(and(eq(t.players.clubId, clubId), isNull(t.players.archivedAt))),
  ]
  for (const name of names) {
    const id = existingByName.get(name)
    queries.push(
      id !== undefined
        ? d
            .update(t.players)
            .set({ archivedAt: null })
            .where(eq(t.players.id, id))
        : d.insert(t.players).values({ clubId, name }),
    )
  }
  await runBatch(db, queries)

  // Re-query active players to pick up newly inserted IDs.
  const active = await d
    .select({ id: t.players.id, name: t.players.name })
    .from(t.players)
    .where(and(eq(t.players.clubId, clubId), isNull(t.players.archivedAt)))
    .orderBy(asc(t.players.id))
  const activeByName = new Map<string, number>()
  for (const p of active) {
    if (!activeByName.has(p.name)) activeByName.set(p.name, p.id)
  }

  const playerIds = names
    .map((name) => activeByName.get(name))
    .filter((id): id is number => id !== undefined)

  // Write seed rows (used when no sessions exist).
  await setSessionRanks(db, null, playerIds)

  // Also overwrite the most recent session's ranks so getLeaderboardPlayers
  // returns the imported order immediately (not just after the next session).
  const latest = await d
    .select({ id: t.sessions.id })
    .from(t.sessions)
    .where(eq(t.sessions.clubId, clubId))
    .orderBy(desc(t.sessions.date))
    .limit(1)
    .get()
  if (latest) {
    await setSessionRanks(db, latest.id, playerIds)
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByDate(
  db: DB,
  clubId: number,
  date: string,
): Promise<{
  id: number
  date: string
  status: SessionStatus
  created_at: string
  closed_at: string | null
} | null> {
  const row = await orm(db)
    .select({
      id: t.sessions.id,
      date: t.sessions.date,
      status: t.sessions.status,
      created_at: t.sessions.createdAt,
      closed_at: t.sessions.closedAt,
    })
    .from(t.sessions)
    .where(and(eq(t.sessions.clubId, clubId), eq(t.sessions.date, date)))
    .get()
  return row ?? null
}

export async function listSessions(
  db: DB,
  clubId: number,
): Promise<{ date: string; status: SessionStatus; attendee_count: number }[]> {
  return orm(db)
    .select({
      date: t.sessions.date,
      status: t.sessions.status,
      attendee_count: count(t.attendees.playerId),
    })
    .from(t.sessions)
    .leftJoin(t.attendees, eq(t.attendees.sessionId, t.sessions.id))
    .where(eq(t.sessions.clubId, clubId))
    .groupBy(t.sessions.id)
    .orderBy(desc(t.sessions.date))
}

export async function createSession(
  db: DB,
  clubId: number,
  date: string,
): Promise<number> {
  const [row] = await orm(db)
    .insert(t.sessions)
    .values({
      clubId,
      date,
      status: 'attendance',
      createdAt: sql`datetime('now')`,
    })
    .returning({ id: t.sessions.id })
  return row.id
}

export async function updateSessionStatus(
  db: DB,
  sessionId: number,
  status: SessionStatus,
  closedAt?: string,
): Promise<void> {
  await orm(db)
    .update(t.sessions)
    .set(closedAt ? { status, closedAt } : { status })
    .where(eq(t.sessions.id, sessionId))
}

// ── Attendees ─────────────────────────────────────────────────────────────────

export async function getAttendees(
  db: DB,
  sessionId: number,
): Promise<{ id: number; name: string }[]> {
  return orm(db)
    .select({ id: t.players.id, name: t.players.name })
    .from(t.attendees)
    .innerJoin(t.players, eq(t.players.id, t.attendees.playerId))
    .leftJoin(
      t.sessionRanks,
      and(
        eq(t.sessionRanks.playerId, t.players.id),
        eq(t.sessionRanks.sessionId, t.attendees.sessionId),
        eq(t.sessionRanks.phase, 'before'),
      ),
    )
    .where(eq(t.attendees.sessionId, sessionId))
    .orderBy(sql`COALESCE(${t.sessionRanks.rankPosition}, 9999)`)
}

/**
 * Marks a player as coming or not, and records the change in the check-in
 * audit with who made it. Only real changes are recorded: marking someone
 * who's already coming, or unmarking someone who isn't, records nothing.
 */
export async function setAttendance(
  db: DB,
  sessionId: number,
  playerId: number,
  attending: boolean,
  byPlayerId: number | null,
): Promise<void> {
  const d = orm(db)
  const isAttending = d
    .select({ one: sql`1` })
    .from(t.attendees)
    .where(
      and(
        eq(t.attendees.sessionId, sessionId),
        eq(t.attendees.playerId, playerId),
      ),
    )
  // Before the change, in the same batch, so it sees the state being changed.
  const event = d.insert(t.attendanceEvents).select(
    d
      .select({
        // Every column, in table order (Drizzle requires it); NULL id = next.
        id: sql<number>`NULL`.as('id'),
        sessionId: sql<number>`${sessionId}`.as('session_id'),
        playerId: t.players.id,
        attending: sql<boolean>`${attending ? 1 : 0}`.as('attending'),
        byPlayerId: sql<number | null>`${byPlayerId}`.as('by_player_id'),
        at: sql<string>`datetime('now')`.as('at'),
      })
      .from(t.players)
      .where(
        and(
          eq(t.players.id, playerId),
          attending ? notExists(isAttending) : exists(isAttending),
        ),
      ),
  )
  await runBatch(db, [
    event,
    attending
      ? d
          .insert(t.attendees)
          .values({ sessionId, playerId })
          .onConflictDoNothing()
      : d
          .delete(t.attendees)
          .where(
            and(
              eq(t.attendees.sessionId, sessionId),
              eq(t.attendees.playerId, playerId),
            ),
          ),
  ])
}

// ── Boxes ─────────────────────────────────────────────────────────────────────

interface BoxRow {
  box_id: number
  box_number: number
  player_id: number
  player_name: string
  position: number
}
interface MatchRow {
  match_id: number
  box_id: number
  match_number: number
}
interface SetRow {
  match_id: number
  set_number: number
  score_a: number | null
  score_b: number | null
}

export async function getBoxes(db: DB, sessionId: number): Promise<Box[]> {
  const boxRows: BoxRow[] = await orm(db)
    .select({
      box_id: t.boxes.id,
      box_number: t.boxes.boxNumber,
      player_id: t.players.id,
      player_name: t.players.name,
      position: t.boxPlayers.position,
    })
    .from(t.boxes)
    .innerJoin(t.boxPlayers, eq(t.boxPlayers.boxId, t.boxes.id))
    .innerJoin(t.players, eq(t.players.id, t.boxPlayers.playerId))
    .where(eq(t.boxes.sessionId, sessionId))
    .orderBy(asc(t.boxes.boxNumber), asc(t.boxPlayers.position))

  const matchRows: MatchRow[] = await orm(db)
    .select({
      match_id: t.matches.id,
      box_id: t.matches.boxId,
      match_number: t.matches.matchNumber,
    })
    .from(t.matches)
    .innerJoin(t.boxes, eq(t.boxes.id, t.matches.boxId))
    .where(eq(t.boxes.sessionId, sessionId))
    .orderBy(asc(t.matches.boxId), asc(t.matches.matchNumber))

  const setRows: SetRow[] = await orm(db)
    .select({
      match_id: t.matchSets.matchId,
      set_number: t.matchSets.setNumber,
      score_a: t.matchSets.scoreA,
      score_b: t.matchSets.scoreB,
    })
    .from(t.matchSets)
    .innerJoin(t.matches, eq(t.matches.id, t.matchSets.matchId))
    .innerJoin(t.boxes, eq(t.boxes.id, t.matches.boxId))
    .where(eq(t.boxes.sessionId, sessionId))
    .orderBy(asc(t.matchSets.matchId), asc(t.matchSets.setNumber))

  const boxMap = new Map<
    number,
    { box_number: number; players: { id: number; name: string }[] }
  >()
  for (const r of boxRows) {
    if (!boxMap.has(r.box_id))
      boxMap.set(r.box_id, { box_number: r.box_number, players: [] })
    boxMap.get(r.box_id)!.players.push({ id: r.player_id, name: r.player_name })
  }

  const setsByMatch = new Map<number, Array<[number | '', number | '']>>()
  for (const s of setRows) {
    if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, [])
    const arr = setsByMatch.get(s.match_id)!
    arr[s.set_number] = [s.score_a ?? '', s.score_b ?? '']
  }

  const matchesByBox = new Map<number, Match[]>()
  for (const m of matchRows) {
    if (!matchesByBox.has(m.box_id)) matchesByBox.set(m.box_id, [])
    const sets = setsByMatch.get(m.match_id) ?? []
    const pairing = getPairing(
      boxMap.get(m.box_id)!.players.length,
      m.match_number,
    )
    matchesByBox.get(m.box_id)!.push({ ...pairing, sets })
  }

  return [...boxMap.entries()]
    .sort((a, b) => a[1].box_number - b[1].box_number)
    .map(([boxId, { players }]) => ({
      players,
      matches: matchesByBox.get(boxId) ?? [],
      finalPlacings: null,
    }))
}

// Match pairing is a pure function of (box size, match number), so it's
// regenerated from the shared rules on read rather than persisted.
export function getPairing(
  boxSize: number,
  matchNumber: number,
): { pair1: number[]; pair2: number[] } {
  const known = (SUPPORTED_BOX_SIZES as readonly number[]).includes(boxSize)
  const pairing = known ? getPairings(boxSize)[matchNumber] : undefined
  return pairing
    ? { pair1: [...pairing.pair1], pair2: [...pairing.pair2] }
    : { pair1: [], pair2: [] }
}

export async function clearBoxes(db: DB, sessionId: number): Promise<void> {
  await runBatch(db, deleteBoxesQueries(db, sessionId))
}

export async function deleteSession(db: DB, sessionId: number): Promise<void> {
  const d = orm(db)
  await runBatch(db, [
    ...deleteBoxesQueries(db, sessionId),
    d.delete(t.attendees).where(eq(t.attendees.sessionId, sessionId)),
    d
      .delete(t.attendanceEvents)
      .where(eq(t.attendanceEvents.sessionId, sessionId)),
    d.delete(t.sessionRanks).where(eq(t.sessionRanks.sessionId, sessionId)),
    d.delete(t.sessions).where(eq(t.sessions.id, sessionId)),
  ])
}

// Deletes a session's boxes and everything under them, children first.
function deleteBoxesQueries(db: DB, sessionId: number): Query[] {
  const d = orm(db)
  const boxIds = d
    .select({ id: t.boxes.id })
    .from(t.boxes)
    .where(eq(t.boxes.sessionId, sessionId))
  const matchIds = d
    .select({ id: t.matches.id })
    .from(t.matches)
    .where(inArray(t.matches.boxId, boxIds))
  return [
    d.delete(t.matchPlayers).where(inArray(t.matchPlayers.matchId, matchIds)),
    d.delete(t.matchSets).where(inArray(t.matchSets.matchId, matchIds)),
    d.delete(t.matches).where(inArray(t.matches.boxId, boxIds)),
    d.delete(t.boxPlayers).where(inArray(t.boxPlayers.boxId, boxIds)),
    d.delete(t.boxes).where(eq(t.boxes.sessionId, sessionId)),
  ]
}

export async function saveBoxes(
  db: DB,
  sessionId: number,
  boxes: BoxInput[],
): Promise<void> {
  // As before (D1 rejected the empty batch): an empty layout is an error, so
  // PUT /boxes doesn't move the session to games with no boxes.
  if (boxes.length === 0) throw new Error('No boxes to save')
  const d = orm(db)

  await runBatch(
    db,
    boxes.map((_, bi) =>
      d.insert(t.boxes).values({ sessionId, boxNumber: bi }),
    ),
  )

  const boxRows = await d
    .select({ id: t.boxes.id, box_number: t.boxes.boxNumber })
    .from(t.boxes)
    .where(eq(t.boxes.sessionId, sessionId))
    .orderBy(asc(t.boxes.boxNumber))

  const playersAndMatches: Query[] = []
  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi]
    const boxId = boxRows[bi].id
    box.players.forEach((playerId, position) =>
      playersAndMatches.push(
        d.insert(t.boxPlayers).values({ boxId, playerId, position }),
      ),
    )
    box.matches.forEach((_, matchNumber) =>
      playersAndMatches.push(
        d.insert(t.matches).values({ boxId, matchNumber }),
      ),
    )
  }
  await runBatch(db, playersAndMatches)

  const matchRows = await d
    .select({
      id: t.matches.id,
      box_id: t.matches.boxId,
      match_number: t.matches.matchNumber,
    })
    .from(t.matches)
    .innerJoin(t.boxes, eq(t.boxes.id, t.matches.boxId))
    .where(eq(t.boxes.sessionId, sessionId))
    .orderBy(asc(t.matches.boxId), asc(t.matches.matchNumber))

  const matchesByBoxId = new Map<number, typeof matchRows>()
  for (const m of matchRows) {
    if (!matchesByBoxId.has(m.box_id)) matchesByBoxId.set(m.box_id, [])
    matchesByBoxId.get(m.box_id)!.push(m)
  }

  const sidesAndSets: Query[] = []
  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi]
    const boxMatches = matchesByBoxId.get(boxRows[bi].id) ?? []

    for (let mi = 0; mi < box.matches.length; mi++) {
      const match = box.matches[mi]
      const matchId = boxMatches[mi]?.id
      if (matchId === undefined) continue

      for (const [side, pair] of [
        [0, match.pair1],
        [1, match.pair2],
      ] as const) {
        for (const pos of pair) {
          sidesAndSets.push(
            d
              .insert(t.matchPlayers)
              .values({ matchId, playerId: box.players[pos], side }),
          )
        }
      }

      for (let si = 0; si < match.sets.length; si++) {
        const [a, b] = match.sets[si]
        if (a === '' && b === '') continue
        sidesAndSets.push(
          setScoreQuery(
            db,
            matchId,
            si,
            a === '' ? null : a,
            b === '' ? null : b,
          ),
        )
      }
    }
  }
  await runBatch(db, sidesAndSets)
}

// Inserts or replaces one set's score.
function setScoreQuery(
  db: DB,
  matchId: number,
  setNumber: number,
  scoreA: number | null,
  scoreB: number | null,
) {
  return orm(db)
    .insert(t.matchSets)
    .values({ matchId, setNumber, scoreA, scoreB })
    .onConflictDoUpdate({
      target: [t.matchSets.matchId, t.matchSets.setNumber],
      set: { scoreA, scoreB },
    })
}

export async function updateSetScore(
  db: DB,
  sessionId: number,
  boxNumber: number,
  matchNumber: number,
  setNumber: number,
  scoreA: number | null,
  scoreB: number | null,
): Promise<boolean> {
  const d = orm(db)
  const match = await d
    .select({ id: t.matches.id })
    .from(t.matches)
    .innerJoin(t.boxes, eq(t.boxes.id, t.matches.boxId))
    .where(
      and(
        eq(t.boxes.sessionId, sessionId),
        eq(t.boxes.boxNumber, boxNumber),
        eq(t.matches.matchNumber, matchNumber),
      ),
    )
    .get()

  if (!match) return false

  if (scoreA === null && scoreB === null) {
    await d
      .delete(t.matchSets)
      .where(
        and(
          eq(t.matchSets.matchId, match.id),
          eq(t.matchSets.setNumber, setNumber),
        ),
      )
  } else {
    await setScoreQuery(db, match.id, setNumber, scoreA, scoreB)
  }

  return true
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function addPlayerMidSession(
  db: DB,
  clubId: number,
  sessionId: number,
  name: string,
  insertRank: number,
  byPlayerId: number | null,
): Promise<number> {
  const d = orm(db)
  await runBatch(db, [
    // Shift ranks down in the open session's before-state
    d
      .update(t.sessionRanks)
      .set({ rankPosition: sql`${t.sessionRanks.rankPosition} + 1` })
      .where(
        and(
          eq(t.sessionRanks.sessionId, sessionId),
          eq(t.sessionRanks.phase, 'before'),
          gte(t.sessionRanks.rankPosition, insertRank),
        ),
      ),
    d.insert(t.players).values({ clubId, name }),
  ])

  const newPlayer = await getPlayerByName(db, clubId, name)
  if (!newPlayer) throw new Error('Failed to insert player')

  await runBatch(db, [
    d.insert(t.sessionRanks).values({
      sessionId,
      playerId: newPlayer.id,
      rankPosition: insertRank,
      phase: 'before',
    }),
    d.insert(t.attendees).values({ sessionId, playerId: newPlayer.id }),
    d.insert(t.attendanceEvents).values({
      sessionId,
      playerId: newPlayer.id,
      attending: true,
      byPlayerId,
    }),
  ])

  return newPlayer.id
}

export async function getPlayerById(
  db: DB,
  clubId: number,
  id: number,
): Promise<{
  id: number
  name: string
  email: string | null
  hc_member_id: string | null
  preferred_name: string | null
} | null> {
  const row = await orm(db)
    .select({
      id: t.players.id,
      name: t.players.name,
      email: t.players.email,
      hc_member_id: t.players.hcMemberId,
      preferred_name: t.players.preferredName,
    })
    .from(t.players)
    .where(
      and(
        eq(t.players.clubId, clubId),
        eq(t.players.id, id),
        isNull(t.players.archivedAt),
      ),
    )
    .get()
  return row ?? null
}

// ── Linking logins to players (V1) ──────────────────────────────────────────

// ── Live session (S6a) ──────────────────────────────────────────────────────

/** A match's sets as GET /api/sessions/:date shows them: blank scores as ''. */
export type SetScores = Array<[number | '', number | '']>

/** One match's scores, by box and match number; null if there's no such match. */
export async function getMatchSets(
  db: DB,
  sessionId: number,
  boxNumber: number,
  matchNumber: number,
): Promise<SetScores | null> {
  const match = await orm(db)
    .select({ id: t.matches.id })
    .from(t.matches)
    .innerJoin(t.boxes, eq(t.boxes.id, t.matches.boxId))
    .where(
      and(
        eq(t.boxes.sessionId, sessionId),
        eq(t.boxes.boxNumber, boxNumber),
        eq(t.matches.matchNumber, matchNumber),
      ),
    )
    .get()
  if (!match) return null
  const rows = await orm(db)
    .select({
      set_number: t.matchSets.setNumber,
      score_a: t.matchSets.scoreA,
      score_b: t.matchSets.scoreB,
    })
    .from(t.matchSets)
    .where(eq(t.matchSets.matchId, match.id))
    .orderBy(asc(t.matchSets.setNumber))
  const sets: SetScores = []
  for (const r of rows) sets[r.set_number] = [r.score_a ?? '', r.score_b ?? '']
  return sets
}

/** Whether the player is in the session's box (by box number). */
export async function isPlayerInBox(
  db: DB,
  sessionId: number,
  boxNumber: number,
  playerId: number,
): Promise<boolean> {
  const row = await orm(db)
    .select({ boxId: t.boxPlayers.boxId })
    .from(t.boxPlayers)
    .innerJoin(t.boxes, eq(t.boxes.id, t.boxPlayers.boxId))
    .where(
      and(
        eq(t.boxes.sessionId, sessionId),
        eq(t.boxes.boxNumber, boxNumber),
        eq(t.boxPlayers.playerId, playerId),
      ),
    )
    .get()
  return row !== undefined
}

/** Unlinked active players in the club, by name: who "This is me" can pick. */
export async function listClaimablePlayers(
  db: DB,
  clubId: number,
): Promise<{ id: number; name: string }[]> {
  return orm(db)
    .select({ id: t.players.id, name: t.players.name })
    .from(t.players)
    .where(
      and(
        eq(t.players.clubId, clubId),
        isNull(t.players.archivedAt),
        isNull(t.players.userId),
      ),
    )
    .orderBy(asc(t.players.name))
}

/**
 * Links the login to the player, if the player is active, in the club and
 * unlinked, and the login has no player yet. False otherwise (e.g. someone
 * claimed them first).
 */
export async function claimPlayer(
  db: DB,
  clubId: number,
  playerId: number,
  userId: string,
): Promise<boolean> {
  if (await getPlayerByUserId(db, clubId, userId)) return false
  try {
    const res = await orm(db)
      .update(t.players)
      .set({ userId })
      .where(
        and(
          eq(t.players.id, playerId),
          eq(t.players.clubId, clubId),
          isNull(t.players.archivedAt),
          isNull(t.players.userId),
        ),
      )
    return res.meta.changes === 1
  } catch {
    // players_user_id is unique: the login got linked meanwhile.
    return false
  }
}

/**
 * Links the login to the one active player whose HelloClub email is this
 * email (ignoring case), if exactly one has it and they're unlinked. Shared
 * emails (several players) never auto-link.
 */
export async function autoLinkByEmail(
  db: DB,
  clubId: number,
  userId: string,
  email: string,
): Promise<{ id: number; name: string } | null> {
  const normalised = email.trim().toLowerCase()
  if (!normalised) return null
  const matches = await orm(db)
    .select({
      id: t.players.id,
      name: t.players.name,
      userId: t.players.userId,
    })
    .from(t.players)
    .where(
      and(
        eq(t.players.clubId, clubId),
        isNull(t.players.archivedAt),
        sql`lower(trim(${t.players.email})) = ${normalised}`,
      ),
    )
  if (matches.length !== 1 || matches[0].userId !== null) return null
  const { id, name } = matches[0]
  return (await claimPlayer(db, clubId, id, userId)) ? { id, name } : null
}

/** The Google account (email) a player signs in with, if linked. */
export async function getPlayerLogin(
  db: DB,
  playerId: number,
): Promise<{ email: string } | null> {
  const row = await orm(db)
    .select({ email: t.user.email })
    .from(t.players)
    .innerJoin(t.user, eq(t.user.id, t.players.userId))
    .where(eq(t.players.id, playerId))
    .get()
  return row ?? null
}

export async function unlinkPlayer(db: DB, playerId: number): Promise<void> {
  await orm(db)
    .update(t.players)
    .set({ userId: null })
    .where(eq(t.players.id, playerId))
}

/** The active player linked to a login (BetterAuth user), if any. */
export async function getPlayerByUserId(
  db: DB,
  clubId: number,
  userId: string,
): Promise<{ id: number; name: string } | null> {
  const row = await orm(db)
    .select({ id: t.players.id, name: t.players.name })
    .from(t.players)
    .where(
      and(
        eq(t.players.clubId, clubId),
        eq(t.players.userId, userId),
        isNull(t.players.archivedAt),
      ),
    )
    .get()
  return row ?? null
}

export async function updatePlayerProfile(
  db: DB,
  id: number,
  fields: {
    name?: string
    email?: string | null
    hc_member_id?: string | null
    preferred_name?: string | null
  },
): Promise<void> {
  // Only the fields given; a blank name is ignored.
  const set: Partial<typeof t.players.$inferInsert> = {}
  if ('name' in fields && fields.name) set.name = fields.name
  if ('email' in fields) set.email = fields.email ?? null
  if ('hc_member_id' in fields) set.hcMemberId = fields.hc_member_id ?? null
  if ('preferred_name' in fields)
    set.preferredName = fields.preferred_name ?? null
  if (Object.keys(set).length === 0) return
  await orm(db).update(t.players).set(set).where(eq(t.players.id, id))
}

export async function deletePlayer(
  db: DB,
  id: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const d = orm(db)
  const gameData =
    (await d.$count(t.attendees, eq(t.attendees.playerId, id))) +
    (await d.$count(t.boxPlayers, eq(t.boxPlayers.playerId, id))) +
    (await d.$count(t.matchPlayers, eq(t.matchPlayers.playerId, id)))
  if (gameData > 0) {
    return { deleted: false, reason: 'Player has game data' }
  }
  // A player with no game data may still be in the check-in audit (marked,
  // then unmarked) or have marked others; keep the others' records.
  await runBatch(db, [
    d.delete(t.attendanceEvents).where(eq(t.attendanceEvents.playerId, id)),
    d
      .update(t.attendanceEvents)
      .set({ byPlayerId: null })
      .where(eq(t.attendanceEvents.byPlayerId, id)),
    d.delete(t.sessionRanks).where(eq(t.sessionRanks.playerId, id)),
    d.delete(t.players).where(eq(t.players.id, id)),
  ])
  return { deleted: true }
}

// ── Club ──────────────────────────────────────────────────────────────────────

export async function getClub(
  db: DB,
  clubId: number,
): Promise<{
  id: number
  name: string
  short_name: string | null
  config: string
} | null> {
  const row = await orm(db)
    .select({
      id: t.clubs.id,
      name: t.clubs.name,
      short_name: t.clubs.shortName,
      config: t.clubs.config,
    })
    .from(t.clubs)
    .where(eq(t.clubs.id, clubId))
    .get()
  return row ?? null
}

// ── New UI (UI-PORT.md, U2) ───────────────────────────────────────────────────
// These read every attendee row of the club's closed sessions (about 1,300
// rows read in 2026-10, growing ~1,500 a year), so callers cache them by
// closedSessionsVersion (services/cache.ts) rather than run them per page view.

/**
 * Changes whenever the set of closed sessions or their results can have
 * changed: a session closed, re-opened or deleted. Cheap (reads the club's
 * session rows only).
 */
export async function closedSessionsVersion(
  db: DB,
  clubId: number,
): Promise<string> {
  const row = await orm(db)
    .select({
      n: count(),
      last: sql<string | null>`max(${t.sessions.closedAt})`,
      ids: sql<number | null>`sum(${t.sessions.id})`,
    })
    .from(t.sessions)
    .where(and(eq(t.sessions.clubId, clubId), eq(t.sessions.status, 'closed')))
    .get()
  return `${row?.n ?? 0}:${row?.last ?? ''}:${row?.ids ?? 0}`
}

/** Per player: closed sessions attended, and the date of the last one. */
export async function playedStats(
  db: DB,
  clubId: number,
): Promise<{ playerId: number; nights: number; lastPlayed: string }[]> {
  return orm(db)
    .select({
      playerId: t.attendees.playerId,
      nights: count(),
      lastPlayed: sql<string>`max(${t.sessions.date})`,
    })
    .from(t.attendees)
    .innerJoin(t.sessions, eq(t.sessions.id, t.attendees.sessionId))
    .where(and(eq(t.sessions.clubId, clubId), eq(t.sessions.status, 'closed')))
    .groupBy(t.attendees.playerId)
}

/** Who attended each session (closed ones, or the others), by date. */
export async function sessionAttendeeNames(
  db: DB,
  clubId: number,
  closed: boolean,
): Promise<{ date: string; name: string }[]> {
  return orm(db)
    .select({ date: t.sessions.date, name: t.players.name })
    .from(t.attendees)
    .innerJoin(t.sessions, eq(t.sessions.id, t.attendees.sessionId))
    .innerJoin(t.players, eq(t.players.id, t.attendees.playerId))
    .where(
      and(
        eq(t.sessions.clubId, clubId),
        closed
          ? eq(t.sessions.status, 'closed')
          : ne(t.sessions.status, 'closed'),
      ),
    )
    .orderBy(asc(t.sessions.date), asc(t.players.name))
}
