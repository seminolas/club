// Club admin (MULTI-CLUB.md): creating and changing clubs, and which
// HelloClub event a club's session syncs to.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { nextNight } from '../app/lib/dates'
import app from '../index'
import { createTestDb } from '../test/d1'
import type { TestDb } from '../test/d1'
import { seed, seedTestUsers } from '../test/fixtures/seed'
import type { Env } from '../types'
import {
  adminClubs,
  clubBySlug,
  createClub,
  forgetClubs,
  pickHcEvent,
  updateClub,
} from './clubs'
import type { Club } from './clubs'
import { SENIORS } from './context'
import type { ServiceContext } from './context'

// Signing in hashes a password.
vi.setConfig({ testTimeout: 60_000 })

const PASSWORD = 'test-password-0123456789'
const BASE = 'http://localhost'
let t: TestDb
let env: Env
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  await seedTestUsers(t.db, PASSWORD)
  // As prod after migrations 0015 and 0017.
  await t.raw
    .prepare(
      `UPDATE clubs SET slug = 'seniors', config = '{"label":"Seniors","title":"Tuesday Box","weekday":2,"hcEvent":"Senior Box"}' WHERE id = 1`,
    )
    .run()
  forgetClubs()
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

/** A context signed in as a staging test account. */
async function as(who: 'test-admin' | 'test-player'): Promise<ServiceContext> {
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
  const headers = new Headers({
    Cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  })
  return { env, db: t.db, headers, club: SENIORS }
}

describe('club admin', () => {
  it('lists the clubs with their night, ladder size and last session', async () => {
    const clubs = await adminClubs(await as('test-admin'))
    expect(clubs).toEqual([
      {
        slug: 'seniors',
        label: 'Seniors',
        title: 'Tuesday Box',
        weekday: 2,
        hcSeries: null,
        players: expect.any(Number),
        lastSession: '2026-01-13',
      },
    ])
    expect(clubs[0].players).toBeGreaterThan(0)
  })

  it('creates a club: an empty ladder, its night, title from its name', async () => {
    const admin = await as('test-admin')
    expect(
      await createClub(admin, {
        label: ' Juniors ',
        slug: 'juniors',
        weekday: 4,
      }),
    ).toEqual({ slug: 'juniors' })
    const club = await clubBySlug(t.db, 'juniors')
    expect(club).toMatchObject({
      label: 'Juniors',
      title: 'Juniors',
      weekday: 4,
    })
    const row = (await adminClubs(admin)).find((c) => c.slug === 'juniors')
    expect(row).toMatchObject({ players: 0, lastSession: null })
  })

  it('refuses a bad, reserved or taken address, a missing name or night', async () => {
    const admin = await as('test-admin')
    const make = (label: string, slug: string, weekday = 4) =>
      createClub(admin, { label, slug, weekday })
    await expect(make('Juniors', 'Jun iors')).rejects.toThrow('lower-case')
    await expect(make('Juniors', 'admin')).rejects.toThrow('can’t be')
    await expect(make('Again', 'seniors')).rejects.toThrow('already')
    await expect(make(' ', 'juniors')).rejects.toThrow('name')
    await expect(make('Juniors', 'juniors', 7)).rejects.toThrow('night')
  })

  it('changes name, title, night and HelloClub series; the address stays', async () => {
    const admin = await as('test-admin')
    await updateClub(admin, 'seniors', {
      label: 'Seniors Tue',
      title: 'Senior Box',
      weekday: 5,
      hcSeries: { id: 'series-1', name: 'Tuesday Senior Box Badminton' },
    })
    expect(await clubBySlug(t.db, 'seniors')).toMatchObject({
      slug: 'seniors',
      label: 'Seniors Tue',
      title: 'Senior Box',
      weekday: 5,
      config: {
        hcSeries: { id: 'series-1', name: 'Tuesday Senior Box Badminton' },
        hcEvent: 'Senior Box',
      },
    })
    await updateClub(admin, 'seniors', { hcSeries: null })
    expect((await clubBySlug(t.db, 'seniors')).config.hcSeries).toBeUndefined()
    await expect(updateClub(admin, 'seniors', { title: ' ' })).rejects.toThrow(
      'title',
    )
  })

  it('is for admins only', async () => {
    const player = await as('test-player')
    await expect(adminClubs(player)).rejects.toThrow('Forbidden')
    await expect(
      createClub(player, { label: 'X', slug: 'x', weekday: 1 }),
    ).rejects.toThrow('Forbidden')
    await expect(updateClub(player, 'seniors', { title: 'X' })).rejects.toThrow(
      'Forbidden',
    )
  })
})

describe('which HelloClub event a session syncs to', () => {
  const club = (config: Club['config']): Club => ({
    id: 1,
    slug: 'seniors',
    label: 'Seniors',
    title: 'Tuesday Box',
    weekday: 2,
    config,
  })
  const events = [
    { id: 'e1', name: 'Pre Box', series: 's-pre' },
    { id: 'e2', name: 'Tuesday Senior Box Badminton', series: 's-box' },
  ]

  it('the linked series’ event', () => {
    expect(
      pickHcEvent(club({ hcSeries: { id: 's-box', name: 'X' } }), events),
    ).toEqual({ event: events[1] })
  })

  it('says so when the series has no event that day (a new term)', () => {
    const r = pickHcEvent(
      club({ hcSeries: { id: 's-old', name: 'Term 3' } }),
      events,
    )
    expect(r).toEqual({ error: expect.stringContaining('No “Term 3” event') })
  })

  it('before a series is linked: by name, not the earlier "Pre Box"', () => {
    expect(pickHcEvent(club({ hcEvent: 'Senior Box' }), events)).toEqual({
      event: events[1],
    })
    expect(pickHcEvent(club({}), events)).toEqual({ event: events[1] })
  })
})

describe('the club’s next night', () => {
  it('is today on its night, else the next one; today if not set', () => {
    // 2026-11-10 is a Tuesday.
    expect(nextNight(2, '2026-11-10T12:00:00')).toBe('2026-11-10')
    expect(nextNight(4, '2026-11-10T12:00:00')).toBe('2026-11-12')
    expect(nextNight(1, '2026-11-10T12:00:00')).toBe('2026-11-16')
    expect(nextNight(null, '2026-11-10T12:00:00')).toBe('2026-11-10')
  })
})
