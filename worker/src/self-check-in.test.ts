// V2: players mark themselves and others as attending while check-in is open;
// every screen gets the one change (who, and who marked them), not a reload.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import * as db from './db'
import app from './index'
import type { ServerMessage } from './live-core'
import { getSession, setAttendance } from './services/session-night'
import { SENIORS } from './services/context'
import type { ServiceContext } from './services/context'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed, seedTestUsers } from './test/fixtures/seed'
import type { Env } from './types'

// Signing in hashes a password: each test signs in once or twice.
vi.setConfig({ testTimeout: 60_000 })

const PASSWORD = 'test-password-0123456789'
const BASE = 'http://localhost'
// Session 4 (club 1): check-in open, nobody marked. Given a ladder below.
const SESSION = 4
const DATE = '2025-12-30'
const LADDER = [1, 2, 3, 4, 5, 6]
// The Test Player login is linked to Chloe Wu (3).
const ME = 3

let t: TestDb
/** What the session's live room was told, in order. */
let told: ServerMessage[]
let env: Env
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  // Slow: the test accounts' passwords are hashed as for real.
  await seedTestUsers(t.db, PASSWORD)
  await t.db.batch(
    LADDER.map((pid, i) =>
      t.db
        .prepare(
          "INSERT INTO session_ranks (session_id, player_id, rank_position, phase) VALUES (?, ?, ?, 'before')",
        )
        .bind(SESSION, pid, i + 1),
    ),
  )
  await t.raw
    .prepare(
      "UPDATE players SET user_id = (SELECT id FROM user WHERE email = 'test-player@staging.invalid') WHERE id = ?",
    )
    .bind(ME)
    .run()
  told = []
  env = {
    DB: t.raw,
    GOOGLE_CLIENT_ID: 'test-client-id',
    HC_API_KEY: 'unused',
    HC_CLUB_ID: 'unused',
    HC_CLUB_SLUG: 'unused',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
    BETTER_AUTH_URL: BASE,
    TEST_LOGIN: '1',
    // A stand-in room that records what it's told.
    SESSION_ROOM: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (_url: string, init?: RequestInit) => {
          told.push(
            init?.body
              ? (JSON.parse(String(init.body)) as ServerMessage)
              : { type: 'changed' },
          )
          return new Response(null, { status: 204 })
        },
      }),
    } as unknown as DurableObjectNamespace,
  }
}, 60_000)

/** A service context signed in as a staging test account, or signed out. */
async function as(who?: 'test-admin' | 'test-player'): Promise<ServiceContext> {
  const headers = new Headers()
  if (who) {
    const res = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({
          email: `${who}@staging.invalid`,
          password: PASSWORD,
        }),
      },
      env,
    )
    headers.set(
      'Cookie',
      res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    )
  }
  return { env, db: t.db, headers, club: SENIORS }
}

const attendees = async () =>
  (await db.getAttendees(t.db, SESSION)).map((p) => p.id).sort()
const byPlayer = async () =>
  (
    await t.raw
      .prepare(
        'SELECT player_id, attending, by_player_id FROM attendance_events ORDER BY id',
      )
      .all()
  ).results

describe('players marking attendance', () => {
  it('a player marks themselves and someone else, and unmarks them', async () => {
    const me = await as('test-player')
    await setAttendance(me, DATE, ME, true)
    await setAttendance(me, DATE, 1, true)
    await setAttendance(me, DATE, 1, false)
    expect(await attendees()).toEqual([ME])
    expect(await byPlayer()).toEqual([
      { player_id: ME, attending: 1, by_player_id: ME },
      { player_id: 1, attending: 1, by_player_id: ME },
      { player_id: 1, attending: 0, by_player_id: ME },
    ])
  })

  it('is refused when signed out, or signed in without a player', async () => {
    await expect(setAttendance(await as(), DATE, 1, true)).rejects.toThrow(
      'Sign in',
    )
    await t.raw.prepare('UPDATE players SET user_id = NULL').run()
    await expect(
      setAttendance(await as('test-player'), DATE, 1, true),
    ).rejects.toThrow('Pick your player first')
    expect(await attendees()).toEqual([])
  })

  it('is refused once games have started or the session is closed', async () => {
    const me = await as('test-player')
    for (const status of ['games', 'closed']) {
      await t.raw
        .prepare('UPDATE sessions SET status = ? WHERE id = ?')
        .bind(status, SESSION)
        .run()
      await expect(setAttendance(me, DATE, 1, true)).rejects.toThrow(
        'Cannot change attendance',
      )
    }
  })

  it('players mark only people on the session’s ladder; admins as before', async () => {
    const me = await as('test-player')
    // Mia Late (14): not on this ladder. 16: another club's, also not on it
    // (people are shared across clubs: MULTI-CLUB.md). 13: archived.
    for (const id of [14, 16])
      await expect(setAttendance(me, DATE, id, true)).rejects.toThrow(
        'ask an admin',
      )
    await expect(setAttendance(me, DATE, 13, true)).rejects.toThrow('not found')
    await expect(setAttendance(me, DATE, 99, true)).rejects.toThrow('not found')
    await setAttendance(await as('test-admin'), DATE, 14, true)
    expect(await attendees()).toEqual([14])
  })
})

describe('who marked whom', () => {
  it('the session carries every check-in change, oldest first, with who', async () => {
    const me = await as('test-player')
    const admin = await as('test-admin')
    await setAttendance(admin, DATE, 1, true)
    await setAttendance(me, DATE, 2, true)
    await setAttendance(me, DATE, 1, false)
    await setAttendance(me, DATE, 1, false) // no change: not recorded
    const { checkIns } = await getSession(await as(), DATE)
    const adminPlayer = checkIns[0].by?.id
    expect(adminPlayer).not.toBe(ME)
    expect(
      checkIns.map((c) => [c.playerId, c.attending, c.by?.id ?? null]),
    ).toEqual([
      [1, true, adminPlayer],
      [2, true, ME],
      [1, false, ME],
    ])
    expect(checkIns[1].by?.name).toBe('Chloe Wu')
    expect(checkIns[1].at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(checkIns.map((c) => c.id)).toEqual(
      [...checkIns.map((c) => c.id)].sort((a, b) => a - b),
    )
  })
})

describe('screens are told the one change', () => {
  it('each change goes to every screen and back to its sender', async () => {
    const me = await as('test-player')
    const on = await setAttendance(me, DATE, 1, true)
    const off = await setAttendance(me, DATE, 1, false)
    expect(told).toEqual([
      { type: 'attendance', ...on },
      { type: 'attendance', ...off },
    ])
    expect(on).toMatchObject({
      player: { id: 1, name: 'Aroha Ngata' },
      attending: true,
      checkIn: {
        playerId: 1,
        attending: true,
        by: { id: ME, name: 'Chloe Wu' },
      },
    })
    expect(off).toMatchObject({
      attending: false,
      checkIn: { playerId: 1, attending: false, by: { id: ME } },
    })
  })

  it('a repeated mark sends the latest change again (screens skip it)', async () => {
    const me = await as('test-player')
    const first = await setAttendance(me, DATE, 1, true)
    const again = await setAttendance(me, DATE, 1, true)
    expect(again.checkIn?.id).toBe(first.checkIn?.id)
  })
})
