// The new UI's ladder and sessions list (UI-PORT.md, U2), and the cache that
// keeps them from reading every attendee row on each page view.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../db'
import { createTestDb } from '../test/d1'
import type { TestDb } from '../test/d1'
import { seed } from '../test/fixtures/seed'
import type { Env } from '../types'
import { clearCache } from './cache'
import type { ServiceContext } from './context'
import { ladder } from './ladder'
import { sessionList } from './sessions'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
  clearCache()
})

/** A context whose database records every SQL statement prepared. */
function context() {
  const statements: string[] = []
  const counting = new Proxy(t.db, {
    get(target, prop, receiver) {
      if (prop === 'prepare')
        return (q: string) => {
          statements.push(q)
          return target.prepare(q)
        }
      const v: unknown = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  const ctx: ServiceContext = {
    env: {} as Env,
    db: counting,
    headers: new Headers(),
  }
  // The per-player aggregate over every attendee row.
  const attendeeReads = () =>
    statements.filter((s) => s.includes('group by "attendees"."player_id"'))
      .length
  return { ctx, statements, attendeeReads }
}

describe('ladder', () => {
  it('has nights and last played from closed sessions only', async () => {
    const rows = await ladder(context().ctx)
    // Session 1 (closed, 2026-01-06) had players 1–9; session 2 is still open.
    expect(rows.map((r) => [r.id, r.rank, r.nights, r.lastPlayed])).toEqual(
      rows.map((r) => [
        r.id,
        r.rank,
        r.id <= 9 ? 1 : 0,
        r.id <= 9 ? '2026-01-06' : null,
      ]),
    )
    expect(rows[0]).toMatchObject({ rank: 1, name: expect.any(String) })
  })

  it('reads the attendee rows once until a session closes or re-opens', async () => {
    const { ctx, attendeeReads } = context()
    await ladder(ctx)
    await ladder(ctx)
    expect(attendeeReads()).toBe(1)
    await db.updateSessionStatus(t.db, 2, 'closed', '2026-01-13T09:00:00.000Z')
    await ladder(ctx)
    expect(attendeeReads()).toBe(2)
    // (The fixture's session 2 has no ladder-after, so check the stats.)
    expect(
      (await db.playedStats(t.db, 1)).find((r) => r.playerId === 10),
    ).toEqual({ playerId: 10, nights: 1, lastPlayed: '2026-01-13' })
    await db.updateSessionStatus(t.db, 2, 'games')
    await ladder(ctx)
    expect(attendeeReads()).toBe(3)
  })
})

describe('sessionList', () => {
  it('lists who attended each session, closed or open', async () => {
    const rows = await sessionList(context().ctx)
    expect(rows.map((r) => [r.date, r.status, r.playerCount])).toEqual([
      ['2026-01-13', 'games', 9],
      ['2026-01-06', 'closed', 9],
      ['2025-12-30', 'attendance', 0],
    ])
    for (const r of rows) expect(r.players).toHaveLength(r.playerCount)
  })

  it('keeps open sessions current while caching closed ones', async () => {
    const { ctx } = context()
    await sessionList(ctx)
    await db.setAttendance(t.db, 4, 1, true, null)
    const rows = await sessionList(ctx)
    expect(rows.find((r) => r.date === '2025-12-30')).toMatchObject({
      playerCount: 1,
      players: [expect.any(String)],
    })
  })

  it('counts attendees of closed sessions once until one closes or re-opens', async () => {
    const { ctx, statements } = context()
    // The closed sessions' counts: every attendee row of the club.
    const closedCounts = () =>
      statements.filter(
        (s) =>
          s.includes('count("attendees"."player_id")') &&
          s.includes('"sessions"."status" = ?'),
      ).length
    await sessionList(ctx)
    await sessionList(ctx)
    expect(closedCounts()).toBe(1)
    await db.updateSessionStatus(t.db, 2, 'closed', '2026-01-13T09:00:00.000Z')
    const rows = await sessionList(ctx)
    expect(closedCounts()).toBe(2)
    expect(rows.map((r) => [r.date, r.status, r.playerCount])).toEqual([
      ['2026-01-13', 'closed', 9],
      ['2026-01-06', 'closed', 9],
      ['2025-12-30', 'attendance', 0],
    ])
  })
})
