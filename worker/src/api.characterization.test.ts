// Characterization tests through the real routes (index.ts), against a local
// D1 with the fixture club: the exact JSON the browser gets, and a whole admin
// session night. Written before S2; must pass unchanged after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import app from './index'
import { signJwt } from './auth'
import { getPairing } from './db'
import { createTestDb, tableRows } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'
import type { Env } from './types'

let t: TestDb
let env: Env
let token: string

beforeAll(async () => {
  t = await createTestDb()
  env = {
    DB: t.raw,
    JWT_SECRET: 'test-secret',
    GOOGLE_CLIENT_ID: 'test-client-id',
    HC_API_KEY: 'unused',
    HC_CLUB_ID: 'unused',
    HC_CLUB_SLUG: 'unused',
  }
  token = await signJwt(
    { sub: '1', player_id: 1, club_id: 1, roles: ['owner', 'admin'] },
    env.JWT_SECRET,
  )
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
})

async function call(
  method: string,
  path: string,
  body?: unknown,
  admin = true,
) {
  const res = await app.request(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(admin ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  )
  return {
    status: res.status,
    body: await res.json<Record<string, unknown>>(),
  }
}
const get = (path: string) => call('GET', path, undefined, false)

describe('public reads', () => {
  it('GET /api/config', async () => {
    expect(await get('/api/config')).toEqual({
      status: 200,
      body: {
        timezone: 'Pacific/Auckland',
        hcSubdomain: 'testclub',
        googleClientId: 'test-client-id',
      },
    })
  })

  it('GET /api/leaderboard', async () => {
    const res = await get('/api/leaderboard')
    expect(res.body.updatedAt).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect({
      ...res,
      body: { ...res.body, updatedAt: '<today>' },
    }).toMatchSnapshot()
  })

  it('GET /api/sessions', async () => {
    expect(await get('/api/sessions')).toMatchSnapshot()
  })

  it('GET /api/sessions/:date (closed, in games, missing)', async () => {
    expect(await get('/api/sessions/2026-01-06')).toMatchSnapshot()
    expect(await get('/api/sessions/2026-01-13')).toMatchSnapshot()
    expect(await get('/api/sessions/2030-01-01')).toEqual({
      status: 404,
      body: { error: 'Not found' },
    })
  })
})

describe('admin', () => {
  it('rejects requests without a token', async () => {
    expect((await call('GET', '/api/players/1', undefined, false)).status).toBe(
      401,
    )
  })

  it('GET /api/players/:id', async () => {
    expect(await call('GET', '/api/players/1')).toMatchSnapshot()
    expect(await call('GET', '/api/players/13')).toEqual({
      status: 404,
      body: { error: 'Not found' },
    })
  })

  it('a whole session night: create, attend, add a player, boxes, scores, close, reopen', async () => {
    const steps: unknown[] = []
    const step = async (
      label: string,
      method: string,
      path: string,
      body?: unknown,
    ) => steps.push({ label, ...(await call(method, path, body)) })

    // Session 2 is still in games; close it first so the new one starts from its ladder.
    await step('close previous', 'POST', '/api/sessions/2026-01-13/close', {
      leaderboard_after: [2, 1, 14, 5, 6, 3, 4, 7, 8, 9, 10, 11, 12],
    })
    await step('create', 'POST', '/api/sessions', { date: '2026-01-20' })
    await step('create again', 'POST', '/api/sessions', { date: '2026-01-20' })
    for (const id of [2, 1, 14, 5, 6, 3, 4, 7])
      await step(`attend ${id}`, 'PUT', '/api/sessions/2026-01-20/attendance', {
        player_id: id,
        attending: true,
      })
    await step('unattend 7', 'PUT', '/api/sessions/2026-01-20/attendance', {
      player_id: 7,
      attending: false,
    })
    await step('add player', 'POST', '/api/players', {
      name: 'Nina New',
      insert_rank: 4,
      session_date: '2026-01-20',
    })
    await step('add existing', 'POST', '/api/players', {
      name: 'Ben Carter',
      insert_rank: 4,
      session_date: '2026-01-20',
    })
    await step('get in attendance', 'GET', '/api/sessions/2026-01-20')
    const matches = (size: number) =>
      Array.from({ length: size === 4 ? 3 : size }, (_, i) => ({
        ...getPairing(size, i),
        sets: [],
      }))
    await step('boxes', 'PUT', '/api/sessions/2026-01-20/boxes', {
      boxes: [
        { players: [2, 1, 19, 14], matches: matches(4), finalPlacings: null },
        { players: [5, 6, 3, 4], matches: matches(4), finalPlacings: null },
      ],
    })
    await step(
      'attend during games',
      'PUT',
      '/api/sessions/2026-01-20/attendance',
      { player_id: 8, attending: true },
    )
    await step('score', 'PUT', '/api/sessions/2026-01-20/score', {
      box_number: 0,
      match_number: 0,
      set_number: 0,
      score_a: 21,
      score_b: 12,
    })
    await step('score', 'PUT', '/api/sessions/2026-01-20/score', {
      box_number: 0,
      match_number: 0,
      set_number: 1,
      score_a: 15,
      score_b: null,
    })
    await step('clear score', 'PUT', '/api/sessions/2026-01-20/score', {
      box_number: 0,
      match_number: 0,
      set_number: 1,
      score_a: null,
      score_b: null,
    })
    await step('score unknown match', 'PUT', '/api/sessions/2026-01-20/score', {
      box_number: 4,
      match_number: 0,
      set_number: 0,
      score_a: 21,
      score_b: 0,
    })
    await step('get in games', 'GET', '/api/sessions/2026-01-20')
    await step(
      'reopen attendance',
      'POST',
      '/api/sessions/2026-01-20/reopen-attendance',
    )
    await step('get after reopen attendance', 'GET', '/api/sessions/2026-01-20')
    await step('boxes again', 'PUT', '/api/sessions/2026-01-20/boxes', {
      boxes: [
        {
          players: [2, 1, 19, 14, 5],
          matches: matches(5),
          finalPlacings: null,
        },
      ],
    })
    await step('close', 'POST', '/api/sessions/2026-01-20/close', {
      leaderboard_after: [1, 2, 19, 14, 5, 6, 3, 4, 7, 8, 9, 10, 11, 12],
    })
    await step('score when closed', 'PUT', '/api/sessions/2026-01-20/score', {
      box_number: 0,
      match_number: 0,
      set_number: 0,
      score_a: 21,
      score_b: 0,
    })
    await step('get closed', 'GET', '/api/sessions/2026-01-20')
    await step('leaderboard', 'GET', '/api/leaderboard')
    await step('reopen', 'POST', '/api/sessions/2026-01-20/reopen')
    await step('list', 'GET', '/api/sessions')

    const masked = JSON.parse(
      JSON.stringify(steps)
        .replace(/"closed_at":"[^"]*"/g, '"closed_at":"<now>"')
        .replace(/"updatedAt":"[^"]*"/g, '"updatedAt":"<today>"'),
    )
    expect(masked).toMatchSnapshot()
    const sessions = (await tableRows(t.db, 'sessions')).map((s) => ({
      ...s,
      created_at: s.id === 5 ? '<now>' : s.created_at,
      closed_at: s.closed_at ? '<set>' : null,
    }))
    expect(sessions).toMatchSnapshot()
  })

  it('players: update profile, delete with and without game data; leaderboard import; delete session', async () => {
    const out = [
      await call('PUT', '/api/players/2', {
        email: 'ben@example.test',
        hc_member_id: 'hc-0002',
      }),
      await call('GET', '/api/players/2'),
      await call('DELETE', '/api/players/1'),
      await call('DELETE', '/api/players/12'),
      await call('POST', '/api/leaderboard/import', { players: [] }),
      await call('POST', '/api/leaderboard/import', {
        players: ['Chloe Wu', 'Aroha Ngata', 'Ben Carter'],
      }),
      await call('DELETE', '/api/sessions/2026-01-13'),
      await call('DELETE', '/api/sessions/2026-01-13'),
      await get('/api/sessions'),
      await get('/api/leaderboard').then((r) => ({
        ...r,
        body: { ...r.body, updatedAt: '<today>' },
      })),
    ]
    expect(out).toMatchSnapshot()
  })
})
