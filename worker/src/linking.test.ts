// V1: linking Google sign-ins to players. Auto-link by HelloClub email when
// exactly one active player has it; otherwise "This is me"; admins unlink.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import app from './index'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed, seedTestUsers } from './test/fixtures/seed'
import type { Env } from './types'

const PASSWORD = 'test-password-0123456789'
const BASE = 'http://localhost'

let t: TestDb
let env: Env
beforeAll(async () => {
  t = await createTestDb()
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
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  await seedTestUsers(t.db, PASSWORD)
})

const sql = (q: string) => t.raw.prepare(q).run()
const addUser = (id: string, email: string) =>
  sql(
    `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('${id}', '${id}', '${email}', 1, 'user', 0, 0)`,
  )
const userOf = async (playerId: number) =>
  (
    await t.raw
      .prepare('SELECT user_id FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ user_id: string | null }>()
  )?.user_id

describe('claimable players', () => {
  it('are the unlinked active players of the club, by name', async () => {
    await addUser('u-x', 'x@example.test')
    await sql("UPDATE players SET user_id = 'u-x' WHERE id = 2")
    const names = (await db.listClaimablePlayers(t.db, 1)).map((p) => p.name)
    expect(names).not.toContain('Ben Carter') // linked
    expect(names).not.toContain('Liam Gone') // archived
    expect(names).not.toContain('Zed Other') // other club
    expect(names).toContain('Aroha Ngata')
    expect(names).toEqual([...names].sort())
  })
})

describe('claiming a player', () => {
  it('links an unlinked active player to a login with no player', async () => {
    await addUser('u-a', 'a@example.test')
    expect(await db.claimPlayer(t.db, 1, 4, 'u-a')).toBe(true)
    expect(await userOf(4)).toBe('u-a')
  })

  it('refuses a player someone already claimed', async () => {
    await addUser('u-a', 'a@example.test')
    await addUser('u-b', 'b@example.test')
    await db.claimPlayer(t.db, 1, 4, 'u-a')
    expect(await db.claimPlayer(t.db, 1, 4, 'u-b')).toBe(false)
    expect(await userOf(4)).toBe('u-a')
  })

  it('refuses a second player for the same login', async () => {
    await addUser('u-a', 'a@example.test')
    await db.claimPlayer(t.db, 1, 4, 'u-a')
    expect(await db.claimPlayer(t.db, 1, 5, 'u-a')).toBe(false)
    expect(await userOf(5)).toBeNull()
  })

  it('refuses archived players and other clubs', async () => {
    await addUser('u-a', 'a@example.test')
    expect(await db.claimPlayer(t.db, 1, 13, 'u-a')).toBe(false)
    expect(await db.claimPlayer(t.db, 1, 15, 'u-a')).toBe(false)
  })
})

describe('auto-linking by HelloClub email', () => {
  it('links the one active player with that email, ignoring case and spaces', async () => {
    await addUser('u-a', 'Aroha@Example.test')
    expect(
      await db.autoLinkByEmail(t.db, 1, 'u-a', ' AROHA@example.TEST '),
    ).toEqual({ id: 1, name: 'Aroha Ngata' })
    expect(await userOf(1)).toBe('u-a')
  })

  it('does nothing when no player has the email', async () => {
    await addUser('u-a', 'nobody@example.test')
    expect(
      await db.autoLinkByEmail(t.db, 1, 'u-a', 'nobody@example.test'),
    ).toBeNull()
  })

  it('does nothing when several players share the email', async () => {
    await sql(
      "UPDATE players SET email = 'family@example.test' WHERE id IN (4, 5)",
    )
    await addUser('u-a', 'family@example.test')
    expect(
      await db.autoLinkByEmail(t.db, 1, 'u-a', 'family@example.test'),
    ).toBeNull()
    expect([await userOf(4), await userOf(5)]).toEqual([null, null])
  })

  it('counts linked players too: a shared email with one already linked still doesn’t link', async () => {
    await sql(
      "UPDATE players SET email = 'family@example.test' WHERE id IN (4, 5)",
    )
    await addUser('u-parent', 'parent@example.test')
    await sql("UPDATE players SET user_id = 'u-parent' WHERE id = 4")
    await addUser('u-a', 'family@example.test')
    expect(
      await db.autoLinkByEmail(t.db, 1, 'u-a', 'family@example.test'),
    ).toBeNull()
    expect(await userOf(5)).toBeNull()
  })

  it('ignores archived players and other clubs when matching', async () => {
    // Liam (archived) shares Aroha's email; Aroha in club 2 too.
    await sql(
      "UPDATE players SET email = 'aroha@example.test' WHERE id IN (13, 15)",
    )
    await addUser('u-a', 'aroha@example.test')
    expect(
      await db.autoLinkByEmail(t.db, 1, 'u-a', 'aroha@example.test'),
    ).toEqual({
      id: 1,
      name: 'Aroha Ngata',
    })
  })
})

describe('admin: a player’s sign-in, and unlinking', () => {
  it('shows the linked Google email; unlink removes the link', async () => {
    await addUser('u-a', 'a@example.test')
    await db.claimPlayer(t.db, 1, 4, 'u-a')
    expect(await db.getPlayerLogin(t.db, 4)).toEqual({
      email: 'a@example.test',
    })
    await db.unlinkPlayer(t.db, 4)
    expect(await db.getPlayerLogin(t.db, 4)).toBeNull()
    expect(await userOf(4)).toBeNull()
  })
})

// ── Through the routes ───────────────────────────────────────────────────────

async function signIn(id: string) {
  const res = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({
        email: `${id}@staging.invalid`,
        password: PASSWORD,
      }),
    },
    env,
  )
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}
async function call(
  path: string,
  cookie: string,
  method = 'GET',
  body?: unknown,
) {
  const res = await app.request(
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
  return { status: res.status, body: await res.json<Record<string, unknown>>() }
}

describe('routes', () => {
  it('/api/me auto-links on the first visit when the email matches', async () => {
    await sql(
      "UPDATE players SET email = 'TEST-PLAYER@staging.invalid' WHERE id = 6",
    )
    const cookie = await signIn('test-player')
    expect((await call('/api/me', cookie)).body).toEqual({
      signedIn: true,
      isAdmin: false,
      name: 'Test Player',
      player: { id: 6, name: 'Ella Brown' },
      justLinked: true,
    })
    expect((await call('/api/me', cookie)).body.justLinked).toBe(false)
  })

  it('"This is me": list, claim, then already-claimed is refused', async () => {
    const cookie = await signIn('test-player')
    expect((await call('/api/me', cookie)).body.player).toBeNull()
    const { body } = await call('/api/me/claimable', cookie)
    expect((body.players as { name: string }[]).map((p) => p.name)).toContain(
      'Dev Singh',
    )
    const claim = await call('/api/me/claim', cookie, 'POST', { player_id: 5 })
    expect(claim).toEqual({
      status: 200,
      body: { ok: true, player: { id: 5, name: 'Dev Singh' } },
    })
    expect((await call('/api/me', cookie)).body.player).toEqual({
      id: 5,
      name: 'Dev Singh',
    })
    // The test admin can't take Dev now.
    const admin = await signIn('test-admin')
    expect(
      (await call('/api/me/claim', admin, 'POST', { player_id: 5 })).status,
    ).toBe(409)
  })

  it('claiming needs a sign-in', async () => {
    expect((await call('/api/me/claimable', '')).status).toBe(401)
    expect(
      (await call('/api/me/claim', '', 'POST', { player_id: 5 })).status,
    ).toBe(401)
  })

  it('admins see the linked Google account and can unlink; players can’t', async () => {
    const player = await signIn('test-player')
    await call('/api/me/claim', player, 'POST', { player_id: 5 })
    const admin = await signIn('test-admin')
    expect((await call('/api/players/5', admin)).body.login).toEqual({
      email: 'test-player@staging.invalid',
    })
    expect((await call('/api/players/5/unlink', player, 'POST')).status).toBe(
      403,
    )
    expect((await call('/api/players/5/unlink', admin, 'POST')).status).toBe(
      200,
    )
    expect((await call('/api/players/5', admin)).body.login).toBeNull()
    expect((await call('/api/me', player)).body.player).toBeNull()
  })
})
