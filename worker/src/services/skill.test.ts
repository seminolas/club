// Skill snapshots (services/skill.ts): computed when missing, one per closed
// session, invalidated by closing, re-opening and deleting, shown on the
// ladder as a rank. The fit itself is tested in domain/skill.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import * as db from '../db'
import { fitSkill } from '../domain/skill'
import { createTestDb, tableRows } from '../test/d1'
import type { TestDb } from '../test/d1'
import { seed, seedTestUsers } from '../test/fixtures/seed'
import type { Env } from '../types'
import { clearCache } from './cache'
import type { ServiceContext } from './context'
import { ladder } from './ladder'
import { fillSkill } from './skill'

let t: TestDb
let env: Env
let cookie: string
const PASSWORD = 'test-password-0123456789'
const BASE = 'http://localhost'

beforeAll(async () => {
  t = await createTestDb()
  env = {
    DB: t.raw,
    GOOGLE_CLIENT_ID: 'test-client-id',
    HC_API_KEY: 'unused',
    HC_CLUB_ID: 'unused',
    HC_CLUB_SLUG: 'unused',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
    BETTER_AUTH_URL: BASE,
    TEST_LOGIN: '1',
  }
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  await seedTestUsers(t.db, PASSWORD)
  clearCache()
  const res = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({
        email: 'test-admin@staging.invalid',
        password: PASSWORD,
      }),
    },
    env,
  )
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
})

const ctx = (): ServiceContext => ({ env, db: t.db, headers: new Headers() })
const admin = (method: string, path: string, body?: unknown) =>
  app.request(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE,
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  )
const snapshots = async () => {
  const rows = await tableRows(t.db, 'session_skill')
  return [...new Set(rows.map((r) => r.session_id))].sort()
}
const ranks = async () =>
  new Map((await ladder(ctx())).map((r) => [r.id, r.skillRank]))

// Fixture: session 1 (2026-01-06) closed, players 1–9 played; session 2
// (2026-01-13) playing, with some scores; sessions 3 (club 2) and 4 open.
describe('skill snapshots', () => {
  it('the ladder fills the latest closed session’s snapshot when missing', async () => {
    expect(await snapshots()).toEqual([])
    const r = await ranks()
    expect(await snapshots()).toEqual([1])
    // Everyone who played session 1 has a rank 1..9; nobody else.
    const ranked = [...r].filter(([, rank]) => rank !== null)
    expect(ranked.map(([id]) => id).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(ranked.map(([, rank]) => rank).sort((a, b) => a! - b!)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  it('matches the fit of the session’s games', async () => {
    await fillSkill(t.db, 1)
    const games = (await db.skillGames(t.db, 1)).map((g) => ({
      ...g,
      day: Date.parse(`${g.date}T00:00:00Z`) / 864e5,
    }))
    const expected = fitSkill(games, Date.parse('2026-01-06T00:00:00Z') / 864e5)
    const saved = await db.getSessionSkill(t.db, 1)
    expect(saved.map((s) => [s.playerId, s.rank, s.games])).toEqual(
      expected.map((s) => [s.playerId, s.rank, s.games]),
    )
    saved.forEach((s, i) =>
      expect(s.strength).toBeCloseTo(expected[i].strength, 9),
    )
  })

  it('closing adds a snapshot; re-opening and deleting take it away', async () => {
    await fillSkill(t.db, 1)
    const before = (await db.getSessionRanks(t.db, 2, 'before')).map(
      (p) => p.id,
    )
    expect(
      (
        await admin('POST', '/api/sessions/2026-01-13/close', {
          leaderboard_after: before,
        })
      ).status,
    ).toBe(200)
    expect(await snapshots()).toEqual([1, 2])
    // Session 2's games count: player 14 played only there.
    expect((await ranks()).get(14)).not.toBeNull()

    expect(
      (await admin('POST', '/api/sessions/2026-01-13/reopen')).status,
    ).toBe(200)
    expect(await snapshots()).toEqual([1])
    expect((await ranks()).get(14) ?? null).toBeNull()

    expect((await admin('DELETE', '/api/sessions/2026-01-06')).status).toBe(200)
    expect(await snapshots()).toEqual([])
    expect([...(await ranks()).values()].every((r) => r === null)).toBe(true)
  })

  it('re-closing an older session recomputes the later ones', async () => {
    const before = (await db.getSessionRanks(t.db, 2, 'before')).map(
      (p) => p.id,
    )
    await admin('POST', '/api/sessions/2026-01-13/close', {
      leaderboard_after: before,
    })
    expect(await snapshots()).toEqual([1, 2])
    const later = await db.getSessionSkill(t.db, 2)
    // Re-open and re-close the older one: the later snapshot is rebuilt each
    // time, and ends up as before once the same data is closed again.
    await admin('POST', '/api/sessions/2026-01-06/reopen')
    // Session 2's is recomputed straight away, without session 1's games.
    expect(await snapshots()).toEqual([2])
    expect(await db.getSessionSkill(t.db, 2)).not.toEqual(later)
    await admin('POST', '/api/sessions/2026-01-06/close', {
      leaderboard_after: (await db.getSessionRanks(t.db, 1, 'after')).map(
        (p) => p.id,
      ),
    })
    expect(await snapshots()).toEqual([1, 2])
    expect(await db.getSessionSkill(t.db, 2)).toEqual(later)
  })
})
