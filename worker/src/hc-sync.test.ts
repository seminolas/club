// POST /api/hc/sync against a stubbed HelloClub: everyone who came ends up
// marked attended. Registered ones are PATCHed (as HelloClub's own admin page
// does), the unregistered are added as attended, registered people who
// didn't come are left alone, and a failed mark doesn't stop the rest.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import app from './index'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed, seedTestUsers } from './test/fixtures/seed'
import { clearCache } from './services/cache'
import { forgetClubs } from './services/clubs'
import type { Env } from './types'

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
    HC_API_KEY: 'test-key',
    HC_CLUB_ID: 'testclub',
    HC_CLUB_SLUG: 'test-club',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
    BETTER_AUTH_URL: BASE,
    TEST_LOGIN: '1',
  }
}, 60_000)
afterAll(() => t.dispose())

// Session 2026-01-06 (seniors): attendees 1–9. Aroha (1) and Chloe (3) have
// HelloClub ids in the fixture; Dev Patel (4) and Dev Singh (5) get them here.
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  await seedTestUsers(t.db, PASSWORD)
  await t.raw.batch([
    t.raw.prepare("UPDATE players SET hc_member_id = 'hc-0004' WHERE id = 4"),
    t.raw.prepare("UPDATE players SET hc_member_id = 'hc-0005' WHERE id = 5"),
    // The seniors as prod has them (0015): found by slug, event "Senior Box".
    t.raw.prepare(
      `UPDATE clubs SET slug = 'seniors', config = '{"label":"Seniors","hcEvent":"Senior Box"}' WHERE id = 1`,
    ),
  ])
  clearCache()
  forgetClubs()
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
afterEach(() => vi.unstubAllGlobals())

type Call = { method: string; url: string; body: unknown }

/** HelloClub with these registrations; a PATCH to `failId` fails. */
function stubHelloClub(
  attendees: { id: string; member: string; hasAttended: boolean }[],
  failId?: string,
) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    if (url.includes('/api/event?'))
      return json({
        events: [
          { id: 'ev-pre', name: 'Pre Box warm-up' },
          { id: 'ev-1', name: 'Tuesday Senior Box Badminton' },
        ],
      })
    if (url.includes('/api/eventAttendee?'))
      return json({
        // Members come as objects or ids; both are handled.
        attendees: attendees.map((a, i) => ({
          id: a.id,
          hasAttended: a.hasAttended,
          member: i % 2 ? a.member : { id: a.member },
        })),
      })
    if (method === 'PATCH')
      return url.endsWith(`/${failId}`)
        ? json({}, 500)
        : json({ hasAttended: true })
    if (url.endsWith('/eventAttendee/many')) return json({})
    return json({ error: 'unexpected' }, 404)
  })
  return calls
}

const sync = async () => {
  const res = await app.request(
    '/api/hc/sync',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE,
        Cookie: cookie,
      },
      body: JSON.stringify({ session_date: '2026-01-06' }),
    },
    env,
  )
  expect(res.status).toBe(200)
  return (await res.json<{ log: { text: string; type: string }[] }>()).log
}

describe('HelloClub sync', () => {
  it('marks registered attendees, adds the unregistered, leaves the rest', async () => {
    const calls = stubHelloClub([
      { id: 'att-1', member: 'hc-0001', hasAttended: true }, // Aroha: already
      { id: 'att-3', member: 'hc-0003', hasAttended: false }, // Chloe: mark
      { id: 'att-5', member: 'hc-0005', hasAttended: false }, // Dev Singh: mark
      { id: 'att-9', member: 'hc-9999', hasAttended: false }, // didn't come
    ])
    const log = await sync()

    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches.map((c) => c.url).sort()).toEqual([
      'https://api.helloclub.com/eventAttendee/att-3',
      'https://api.helloclub.com/eventAttendee/att-5',
    ])
    expect(
      patches.every((c) => JSON.stringify(c.body) === '{"hasAttended":true}'),
    ).toBe(true)

    const many = calls.filter((c) => c.url.endsWith('/eventAttendee/many'))
    expect(many).toHaveLength(1)
    expect(many[0].body).toMatchObject({
      event: 'ev-1',
      hasAttended: true,
      meta: { members: ['hc-0004'] },
    })

    const text = log.map((l) => l.text).join('\n')
    expect(text).toContain('Found event: "Tuesday Senior Box Badminton"')
    expect(text).toContain(
      'Done. 1 already in HC, 2 marked attended, 1 synced, 5 no HC ID.',
    )
    expect(log.some((l) => l.type === 'error')).toBe(false)
  })

  it('a failed mark is reported and the rest still go through', async () => {
    const calls = stubHelloClub(
      [
        { id: 'att-3', member: 'hc-0003', hasAttended: false },
        { id: 'att-5', member: 'hc-0005', hasAttended: false },
      ],
      'att-3',
    )
    const log = await sync()
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2)
    expect(calls.some((c) => c.url.endsWith('/eventAttendee/many'))).toBe(true)
    expect(log).toContainEqual({
      text: '  ✗ Chloe Wu (HTTP 500)',
      type: 'error',
    })
    expect(log.map((l) => l.text)).toContain(
      'Done. 1 marked attended, 2 synced, 5 no HC ID, 1 not marked (run the sync again).',
    )
  })

  it('reads every page of registrations', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `att-x${i}`,
      member: `hc-x${i}`,
      hasAttended: true,
    }))
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      const json = (b: unknown) => new Response(JSON.stringify(b))
      if (url.includes('/api/event?'))
        return json({ events: [{ id: 'ev-1', name: 'Senior Box' }] })
      if (url.includes('offset=0')) return json({ attendees: many })
      if (url.includes('offset=100'))
        return json({
          attendees: [{ id: 'att-3', member: 'hc-0003', hasAttended: true }],
        })
      return json({})
    })
    const log = await sync()
    // Chloe is on the second page, already attended: not marked again.
    expect(calls.filter((c) => c.startsWith('PATCH'))).toEqual([])
    expect(log.map((l) => l.text)).toContain(
      'Done. 1 already in HC, 3 synced, 5 no HC ID.',
    )
  })
})
