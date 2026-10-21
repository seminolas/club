// Characterization tests for db.ts: what every query the app uses returns and
// writes today, against a real local D1 with the fixture club. Written before
// S2 moved the queries to Drizzle; the Drizzle versions must pass unchanged.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import { createTestDb, tableRows } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'

const TABLES = [
  'clubs',
  'players',
  'sessions',
  'session_ranks',
  'attendees',
  'boxes',
  'box_players',
  'matches',
  'match_sets',
  'match_players',
]

const SEEDED_SESSIONS = 4

// Rows of every table, with "now" timestamps masked (shape-checked first).
async function snapshotTables(d: db.DB) {
  const out: Record<string, unknown[]> = {}
  for (const table of TABLES) {
    out[table] = (await tableRows(d, table)).map((row) => {
      const r = { ...row }
      // Sessions the tests create (the fixture has ids 1-4).
      if (table === 'sessions' && Number(r.id) > SEEDED_SESSIONS) {
        expect(r.created_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
        r.created_at = '<now>'
      }
      if (
        table === 'players' &&
        typeof r.archived_at === 'string' &&
        r.archived_at !== '2026-01-02'
      ) {
        expect(r.archived_at).toMatch(/^\d{4}-\d\d-\d\d$/)
        r.archived_at = '<today>'
      }
      return r
    })
  }
  return out
}

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())

describe('reads', () => {
  beforeAll(async () => {
    await t.clear()
    await seed(t.db)
  })

  it('getLeaderboardPlayers: latest session’s ladder (before-phase while not closed), active players only', async () => {
    expect(await db.getLeaderboardPlayers(t.db, 1)).toMatchSnapshot()
    expect(await db.getLeaderboardPlayers(t.db, 2)).toMatchSnapshot()
    // No sessions yet: the seed ladder (rows with no session).
    expect(await db.getLeaderboardPlayers(t.db, 3)).toEqual([
      { id: 18, name: 'Otis Second', hc_member_id: null, preferred_name: null },
      { id: 17, name: 'Nora First', hc_member_id: null, preferred_name: null },
    ])
  })

  it('getPlayerByName: active players in the club only', async () => {
    expect(await db.getPlayerByName(t.db, 1, 'Aroha Ngata')).toEqual({
      id: 1,
      name: 'Aroha Ngata',
    })
    expect(await db.getPlayerByName(t.db, 2, 'Aroha Ngata')).toEqual({
      id: 15,
      name: 'Aroha Ngata',
    })
    expect(await db.getPlayerByName(t.db, 1, 'Liam Gone')).toBeNull()
    expect(await db.getPlayerByName(t.db, 1, 'Nobody')).toBeNull()
  })

  it('getSessionRanks: by session and phase; seed rows for null', async () => {
    expect({
      seed: await db.getSessionRanks(t.db, null),
      s1before: await db.getSessionRanks(t.db, 1, 'before'),
      s1after: await db.getSessionRanks(t.db, 1),
      s2before: await db.getSessionRanks(t.db, 2, 'before'),
      s2after: await db.getSessionRanks(t.db, 2, 'after'),
      missing: await db.getSessionRanks(t.db, 99, 'before'),
    }).toMatchSnapshot()
  })

  it('getSessionByDate: scoped to the club', async () => {
    expect(await db.getSessionByDate(t.db, 1, '2026-01-13')).toMatchSnapshot()
    expect(await db.getSessionByDate(t.db, 2, '2026-01-13')).toMatchSnapshot()
    expect(await db.getSessionByDate(t.db, 1, '2026-01-06')).toMatchSnapshot()
    expect(await db.getSessionByDate(t.db, 1, '2030-01-01')).toBeNull()
  })

  it('listSessions: newest first, with attendee counts', async () => {
    expect(await db.listSessions(t.db, 1)).toEqual([
      { date: '2026-01-13', status: 'games', attendee_count: 9 },
      { date: '2026-01-06', status: 'closed', attendee_count: 9 },
      { date: '2025-12-30', status: 'attendance', attendee_count: 0 },
    ])
    expect(await db.listSessions(t.db, 2)).toEqual([
      { date: '2026-01-13', status: 'attendance', attendee_count: 1 },
    ])
  })

  it('getAttendees: in ladder-before order', async () => {
    expect(await db.getAttendees(t.db, 1)).toMatchSnapshot()
    expect(await db.getAttendees(t.db, 2)).toMatchSnapshot()
    expect(await db.getAttendees(t.db, 4)).toEqual([])
    expect(await db.getAttendees(t.db, 99)).toEqual([])
  })

  it("getBoxes: players, pairings and sets (blank scores as '')", async () => {
    expect(await db.getBoxes(t.db, 1)).toMatchSnapshot()
    expect(await db.getBoxes(t.db, 2)).toMatchSnapshot()
    expect(await db.getBoxes(t.db, 3)).toEqual([])
    expect(await db.getBoxes(t.db, 4)).toEqual([])
  })

  it('getPlayerById: active players in the club only', async () => {
    expect(await db.getPlayerById(t.db, 1, 1)).toMatchSnapshot()
    expect(await db.getPlayerById(t.db, 1, 2)).toMatchSnapshot()
    expect(await db.getPlayerById(t.db, 1, 13)).toBeNull()
    expect(await db.getPlayerById(t.db, 1, 15)).toBeNull()
  })

  it('getPlayerByUserId: the active player linked to a login', async () => {
    await t.raw
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-1', 'Aroha', 'a@example.test', 1, 'user', 0, 0), ('u-13', 'Liam', 'l@example.test', 1, 'user', 0, 0)",
      )
      .run()
    await t.raw
      .prepare("UPDATE players SET user_id = 'u-' || id WHERE id IN (1, 13)")
      .run()
    expect(await db.getPlayerByUserId(t.db, 1, 'u-1')).toEqual({
      id: 1,
      name: 'Aroha Ngata',
    })
    expect(await db.getPlayerByUserId(t.db, 2, 'u-1')).toBeNull()
    expect(await db.getPlayerByUserId(t.db, 1, 'u-13')).toBeNull()
    expect(await db.getPlayerByUserId(t.db, 1, 'nobody')).toBeNull()
    await t.raw.prepare('UPDATE players SET user_id = NULL').run()
    await t.raw.prepare('DELETE FROM user').run()
  })

  it('getClub', async () => {
    expect(await db.getClub(t.db, 1)).toMatchSnapshot()
    expect(await db.getClub(t.db, 2)).toMatchSnapshot()
    expect(await db.getClub(t.db, 9)).toBeNull()
  })
})

describe('writes', () => {
  beforeEach(async () => {
    await t.clear()
    await seed(t.db)
  })

  it('createSession + setSessionRanks (as POST /api/sessions does)', async () => {
    const ladder = await db.getLeaderboardPlayers(t.db, 1)
    const id = await db.createSession(t.db, 1, '2026-01-20')
    await db.setSessionRanks(
      t.db,
      id,
      ladder.map((p) => p.id),
      'before',
    )
    expect(id).toBe(SEEDED_SESSIONS + 1)
    expect(await db.getLeaderboardPlayers(t.db, 1)).toEqual(ladder)
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('setSessionRanks: replaces one session+phase, or all seed rows; ignores an empty list', async () => {
    await db.setSessionRanks(t.db, 2, [3, 1, 2], 'after')
    await db.setSessionRanks(t.db, null, [5, 4])
    await db.setSessionRanks(t.db, 1, [], 'before')
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('replaceLeaderboard: re-ranks, archives omitted players, revives and adds by name', async () => {
    await db.replaceLeaderboard(t.db, 1, [
      'Chloe Wu',
      'Liam Gone',
      'Aroha Ngata',
      'New Person',
      'Ben Carter',
    ])
    expect(await snapshotTables(t.db)).toMatchSnapshot()
    expect(await db.getLeaderboardPlayers(t.db, 1)).toMatchSnapshot()
  })

  it('updateSessionStatus: with and without closed_at', async () => {
    await db.updateSessionStatus(t.db, 2, 'closed', '2026-01-13T10:00:00.000Z')
    await db.updateSessionStatus(t.db, 1, 'games')
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('setAttendance: add (idempotent) and remove', async () => {
    await db.setAttendance(t.db, 2, 8, true)
    await db.setAttendance(t.db, 2, 8, true)
    await db.setAttendance(t.db, 2, 1, false)
    await db.setAttendance(t.db, 2, 99, false)
    expect(await db.getAttendees(t.db, 2)).toMatchSnapshot()
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('clearBoxes: removes a session’s boxes, matches, sets and match players only', async () => {
    await db.clearBoxes(t.db, 2)
    await db.clearBoxes(t.db, 3)
    expect(await db.getBoxes(t.db, 2)).toEqual([])
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('saveBoxes: boxes, positions, matches, match players and non-blank sets', async () => {
    await db.clearBoxes(t.db, 2)
    await db.saveBoxes(t.db, 2, [
      {
        players: [1, 2, 14, 5, 6],
        matches: getPairingsWithSets(5, {
          0: [
            [21, 10],
            ['', 21],
          ],
          2: [['', '']],
        }),
        finalPlacings: null,
      },
      {
        players: [3, 4, 7, 10],
        matches: getPairingsWithSets(4, {}),
        finalPlacings: null,
      },
    ])
    expect(await db.getBoxes(t.db, 2)).toMatchSnapshot()
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('saveBoxes: fails with no boxes (so PUT /boxes doesn’t move the session to games)', async () => {
    await expect(db.saveBoxes(t.db, 2, [])).rejects.toThrow()
  })

  it('updateSetScore: insert, replace, delete; false for an unknown match', async () => {
    expect(await db.updateSetScore(t.db, 2, 0, 1, 1, 21, 9)).toBe(true)
    expect(await db.updateSetScore(t.db, 2, 0, 0, 0, 21, 16)).toBe(true)
    expect(await db.updateSetScore(t.db, 2, 1, 2, 0, null, null)).toBe(true)
    expect(await db.updateSetScore(t.db, 2, 1, 3, 0, 15, null)).toBe(true)
    expect(await db.updateSetScore(t.db, 2, 5, 0, 0, 21, 0)).toBe(false)
    expect(await db.getBoxes(t.db, 2)).toMatchSnapshot()
  })

  it('addPlayerMidSession: shifts the before-ladder, ranks and marks the new player attending', async () => {
    const id = await db.addPlayerMidSession(t.db, 1, 2, 'Nina New', 2)
    expect(id).toBe(19)
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('updatePlayerProfile: only the fields given; blank name ignored', async () => {
    await db.updatePlayerProfile(t.db, 2, {
      email: 'ben@example.test',
      preferred_name: null,
    })
    await db.updatePlayerProfile(t.db, 3, {
      name: 'Chloe Wu-Smith',
      hc_member_id: null,
    })
    await db.updatePlayerProfile(t.db, 4, { name: '' })
    await db.updatePlayerProfile(t.db, 5, {})
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('deletePlayer: refuses players with game data; otherwise removes them and their ranks', async () => {
    expect(await db.deletePlayer(t.db, 1)).toEqual({
      deleted: false,
      reason: 'Player has game data',
    })
    expect(await db.deletePlayer(t.db, 12)).toEqual({ deleted: true })
    expect(await db.deletePlayer(t.db, 99)).toEqual({ deleted: true })
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })

  it('deleteSession: removes everything belonging to the session', async () => {
    await db.deleteSession(t.db, 2)
    expect(await snapshotTables(t.db)).toMatchSnapshot()
  })
})

// Prod-sized data: about 150 on the ladder and 40 at a session. D1 allows at
// most 100 bound parameters per statement, so writes that bundled many rows
// into one statement would fail here but not on the small fixture.
describe('writes at real scale', () => {
  const NAMES = Array.from(
    { length: 160 },
    (_, i) => `Player ${String(i + 1).padStart(3, '0')}`,
  )
  const counts = async () => {
    const out: Record<string, number> = {}
    for (const table of TABLES)
      out[table] = (await tableRows(t.db, table)).length
    return out
  }

  beforeEach(async () => {
    await t.clear()
    await seed(t.db)
  })

  it('a 160-player ladder import, a session from it, a mid-session add, 8 full boxes, clear and delete', async () => {
    const steps: Record<string, unknown> = {}

    // Close the open session first: an import while a session is open doesn't
    // show (see AGENTS.md, Known issues).
    await db.updateSessionStatus(t.db, 2, 'closed', '2026-01-13T10:00:00.000Z')
    await db.replaceLeaderboard(t.db, 1, ['Aroha Ngata', ...NAMES])
    const ladder = await db.getLeaderboardPlayers(t.db, 1)
    expect(ladder).toHaveLength(161)
    steps.importedLadder = ladder.map((p) => `${p.id}:${p.name}`).join(', ')

    // As POST /api/sessions does: read the ladder before creating the session
    // (afterwards the new, empty session is the latest).
    const sessionId = await db.createSession(t.db, 1, '2026-01-20')
    await db.setSessionRanks(
      t.db,
      sessionId,
      ladder.map((p) => p.id),
      'before',
    )
    const attending = ladder.slice(0, 39).map((p) => p.id)
    for (const id of attending)
      await db.setAttendance(t.db, sessionId, id, true)
    const added = await db.addPlayerMidSession(
      t.db,
      1,
      sessionId,
      'Late Arrival',
      20,
    )
    steps.added = added
    steps.beforeLadder = (await db.getSessionRanks(t.db, sessionId, 'before'))
      .map((p) => p.id)
      .join(',')
    steps.afterAdd = await counts()

    const players = (await db.getAttendees(t.db, sessionId)).map((p) => p.id)
    const boxes = Array.from({ length: 8 }, (_box, b) => {
      const ids = players.slice(b * 5, b * 5 + 5)
      return {
        players: ids,
        matches: getPairingsWithSets(
          5,
          Object.fromEntries(
            Array.from({ length: 5 }, (_, m) => [
              m,
              [
                [21, (b + m) % 20],
                [(b * m) % 20, 21],
                [21, 19],
              ],
            ]),
          ),
        ),
        finalPlacings: null,
      }
    })
    await db.saveBoxes(t.db, sessionId, boxes)
    steps.boxes = (await db.getBoxes(t.db, sessionId)).map(
      (box) =>
        `${box.players.map((p) => p.id).join(',')} | ${box.matches.map((m) => m.sets.map((s) => s.join('-')).join(' ')).join(' / ')}`,
    )
    steps.afterBoxes = await counts()

    await db.updateSetScore(t.db, sessionId, 7, 4, 2, null, null)
    await db.updateSetScore(t.db, sessionId, 3, 1, 1, 15, 21)
    steps.edited = (await db.getBoxes(t.db, sessionId))
      .map((box) => box.matches.map((m) => m.sets.length).join(''))
      .join(' ')

    await db.clearBoxes(t.db, sessionId)
    steps.afterClear = await counts()
    await db.deleteSession(t.db, sessionId)
    steps.afterDelete = await counts()

    expect(steps).toMatchSnapshot()
  }, 60_000)
})

// Matches for a box as the client sends them: pairings plus sets.
function getPairingsWithSets(
  size: number,
  sets: Record<number, (number | '')[][]>,
) {
  return Array.from({ length: size === 4 ? 3 : size }, (_, i) => ({
    ...db.getPairing(size, i),
    sets: (sets[i] ?? []) as [number | '', number | ''][],
  }))
}
