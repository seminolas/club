// The check-in audit (S3a): every change to who's coming is recorded with who
// made it and when, including someone unmarking someone else.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import app from './index'
import * as db from './db'
import { createTestDb, tableRows } from './test/d1'
import type { TestDb } from './test/d1'
import { seed, seedTestUsers } from './test/fixtures/seed'
import type { Env } from './types'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
})

// Session 4 (club 1) is open for attendance with nobody marked yet.
const SESSION = 4
const events = async () =>
  (await tableRows(t.db, 'attendance_events')).map((e) => {
    expect(e.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    const { id: _id, at: _at, ...rest } = e
    return rest
  })
const event = (player_id: number, attending: 0 | 1, by: number | null) => ({
  session_id: SESSION,
  player_id,
  attending,
  by_player_id: by,
})

describe('check-in audit', () => {
  it('records marking and unmarking, with who did it', async () => {
    await db.setAttendance(t.db, SESSION, 1, true, 2) // 2 marks 1
    await db.setAttendance(t.db, SESSION, 1, false, 3) // 3 unmarks 1
    await db.setAttendance(t.db, SESSION, 1, true, 1) // 1 marks themselves
    expect(await events()).toEqual([
      event(1, 1, 2),
      event(1, 0, 3),
      event(1, 1, 1),
    ])
    expect((await db.getAttendees(t.db, SESSION)).map((p) => p.id)).toEqual([1])
  })

  it('records only real changes', async () => {
    await db.setAttendance(t.db, SESSION, 1, true, 2)
    await db.setAttendance(t.db, SESSION, 1, true, 3) // already coming
    await db.setAttendance(t.db, SESSION, 5, false, 2) // wasn't coming
    expect(await events()).toEqual([event(1, 1, 2)])
  })

  it('a player added mid-session is recorded as marked by whoever added them', async () => {
    const id = await db.addPlayerMidSession(t.db, 1, SESSION, 'Nina New', 1, 2)
    expect(await events()).toEqual([event(id, 1, 2)])
  })

  it('deleting the session deletes its audit', async () => {
    await db.setAttendance(t.db, SESSION, 1, true, 2)
    await db.deleteSession(t.db, SESSION)
    expect(await events()).toEqual([])
  })

  it('a player marked then unmarked can still be deleted; who they marked stays', async () => {
    const id = await db.addPlayerMidSession(t.db, 1, SESSION, 'Oops', 1, 2)
    await db.setAttendance(t.db, SESSION, 3, true, id)
    await db.setAttendance(t.db, SESSION, id, false, 2)
    expect(await db.deletePlayer(t.db, id)).toEqual({ deleted: true })
    expect(await events()).toEqual([event(3, 1, null)])
  })
})

describe('check-in audit through the API', () => {
  const PASSWORD = 'test-password-0123456789'
  const BASE = 'http://localhost'
  const env = (): Env => ({
    DB: t.raw,
    GOOGLE_CLIENT_ID: 'test-client-id',
    HC_API_KEY: 'unused',
    HC_CLUB_ID: 'unused',
    HC_CLUB_SLUG: 'unused',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
    BETTER_AUTH_URL: BASE,
    TEST_LOGIN: '1',
  })

  it('records the signed-in admin as who marked and unmarked', async () => {
    await seedTestUsers(t.db, PASSWORD)
    const signIn = await app.request(
      '/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({
          email: 'test-admin@staging.invalid',
          password: PASSWORD,
        }),
      },
      env(),
    )
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const call = (method: string, path: string, body?: unknown) =>
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
        env(),
      )
    const me = await (
      await call('GET', '/api/me')
    ).json<{
      player: { id: number }
    }>()
    const admin = me.player.id

    for (const attending of [true, false]) {
      const res = await call('PUT', '/api/sessions/2025-12-30/attendance', {
        player_id: 1,
        attending,
      })
      expect(res.status).toBe(200)
    }
    expect(await events()).toEqual([event(1, 1, admin), event(1, 0, admin)])
  })
})
