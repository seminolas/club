// BetterAuth through the real routes: the staging test accounts, admin checks
// with a session cookie, and that password sign-in is off unless TEST_LOGIN.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testLoginEnabled } from './better-auth'
import app from './index'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'
import { testUserEmail, testUsersSql } from './test-login'
import type { Env } from './types'

const PASSWORD = 'test-password-0123456789'
const BASE = 'http://localhost'

let t: TestDb
let env: Env
beforeAll(async () => {
  t = await createTestDb()
  await seed(t.db)
  const sql = await testUsersSql(PASSWORD)
  await t.raw.batch(
    sql
      .split('\n')
      .filter(Boolean)
      .map((s) => t.raw.prepare(s)),
  )
  env = {
    DB: t.raw,
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    HC_API_KEY: 'unused',
    HC_CLUB_ID: 'unused',
    HC_CLUB_SLUG: 'unused',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
    BETTER_AUTH_URL: BASE,
    TEST_LOGIN: '1',
  }
}, 60_000)
afterAll(() => t.dispose())

async function request(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
  e: Env = env,
) {
  return app.request(
    path,
    {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE,
        ...(init.cookie ? { Cookie: init.cookie } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    e,
  )
}

async function signIn(id: string, password = PASSWORD, e: Env = env) {
  const res = await request(
    '/api/auth/sign-in/email',
    { method: 'POST', body: { email: testUserEmail(id), password } },
    e,
  )
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ')
  return { status: res.status, cookie }
}

describe('staging test accounts (TEST_LOGIN=1)', () => {
  it('the test admin signs in and can use admin routes', async () => {
    const { status, cookie } = await signIn('test-admin')
    expect(status).toBe(200)
    expect(cookie).toMatch(/better-auth\.session_token=/)
    const res = await request('/api/players/1', { cookie })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 1, name: 'Aroha Ngata' })
  })

  it('the test player signs in but is refused admin routes', async () => {
    const { status, cookie } = await signIn('test-player')
    expect(status).toBe(200)
    expect((await request('/api/players/1', { cookie })).status).toBe(403)
  })

  it('rejects a wrong password, and no session means 401', async () => {
    expect((await signIn('test-admin', 'wrong-password')).status).toBe(401)
    expect((await request('/api/players/1')).status).toBe(401)
  })

  it('sign-up is off', async () => {
    const res = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email: 'new@example.test', password: PASSWORD, name: 'New' },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    const { results } = await t.raw
      .prepare("SELECT id FROM user WHERE email = 'new@example.test'")
      .all()
    expect(results).toEqual([])
  })

  it('signing out ends the session', async () => {
    const { cookie } = await signIn('test-admin')
    expect(
      (
        await request('/api/auth/sign-out', {
          method: 'POST',
          body: {},
          cookie,
        })
      ).status,
    ).toBe(200)
    expect((await request('/api/players/1', { cookie })).status).toBe(401)
  })
})

describe('without TEST_LOGIN (as on prod)', () => {
  it('password sign-in is rejected', async () => {
    const prodLike = { ...env, TEST_LOGIN: undefined }
    const { status, cookie } = await signIn('test-admin', PASSWORD, prodLike)
    expect(status).toBeGreaterThanOrEqual(400)
    expect(cookie).toBe('')
  })

  it('TEST_LOGIN refuses to turn on for a non-staging URL', () => {
    expect(() =>
      testLoginEnabled({
        ...env,
        BETTER_AUTH_URL: 'https://club.vilhelmas-f78.workers.dev',
      }),
    ).toThrow(/only allowed on staging/)
    expect(
      testLoginEnabled({
        ...env,
        BETTER_AUTH_URL: 'https://club-api-staging.vilhelmas-f78.workers.dev',
      }),
    ).toBe(true)
  })
})

describe('/api/me', () => {
  it('signed out', async () => {
    expect(await (await request('/api/me')).json()).toEqual({
      signedIn: false,
      isAdmin: false,
    })
  })

  it('the test admin (no player)', async () => {
    const { cookie } = await signIn('test-admin')
    expect(await (await request('/api/me', { cookie })).json()).toEqual({
      signedIn: true,
      isAdmin: true,
      name: 'Test Admin',
      player: null,
    })
  })

  it('a player linked to their login', async () => {
    await t.raw
      .prepare("UPDATE players SET user_id = 'test-player' WHERE id = 3")
      .run()
    const { cookie } = await signIn('test-player')
    expect(await (await request('/api/me', { cookie })).json()).toEqual({
      signedIn: true,
      isAdmin: false,
      name: 'Test Player',
      player: { id: 3, name: 'Chloe Wu' },
    })
    await t.raw.prepare('UPDATE players SET user_id = NULL WHERE id = 3').run()
  })
})

describe('Google sign-in', () => {
  it('starts the redirect to Google with our callback', async () => {
    const res = await request('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL: '/#/players' },
    })
    expect(res.status).toBe(200)
    const { url } = await res.json<{ url: string }>()
    const google = new URL(url)
    expect(google.origin).toBe('https://accounts.google.com')
    expect(google.searchParams.get('client_id')).toBe('test-client-id')
    expect(google.searchParams.get('redirect_uri')).toBe(
      `${BASE}/api/auth/callback/google`,
    )
  })
})
