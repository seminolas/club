// savedByVersion (services/cache.ts; 0018): results over closed sessions are
// kept in memory and in saved_totals, so a cold isolate reads one row.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../db'
import { createTestDb } from '../test/d1'
import type { TestDb } from '../test/d1'
import { seed } from '../test/fixtures/seed'
import { clearCache, savedByVersion } from './cache'

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

const counting = <T>(value: T) => {
  const f = Object.assign(
    async () => {
      f.calls++
      return value
    },
    { calls: 0 },
  )
  return f
}

describe('savedByVersion', () => {
  it('computes once, saves, and a cold isolate reads the saved row', async () => {
    const compute = counting([{ playerId: 1, nights: 3 }])
    expect(await savedByVersion(t.db, 1, 'played', 'v1', compute)).toEqual([
      { playerId: 1, nights: 3 },
    ])
    expect(await db.getSavedTotal(t.db, 1, 'played')).toEqual({
      version: 'v1',
      data: '[{"playerId":1,"nights":3}]',
    })
    // Same isolate: memory.
    await savedByVersion(t.db, 1, 'played', 'v1', compute)
    // Cold isolate: the saved row, not a recompute.
    clearCache()
    expect(await savedByVersion(t.db, 1, 'played', 'v1', compute)).toEqual([
      { playerId: 1, nights: 3 },
    ])
    expect(compute.calls).toBe(1)
  })

  it('a new version recomputes and replaces the saved row', async () => {
    await savedByVersion(t.db, 1, 'played', 'v1', counting(['old']))
    clearCache()
    const compute = counting(['new'])
    expect(await savedByVersion(t.db, 1, 'played', 'v2', compute)).toEqual([
      'new',
    ])
    expect(compute.calls).toBe(1)
    expect(await db.getSavedTotal(t.db, 1, 'played')).toEqual({
      version: 'v2',
      data: '["new"]',
    })
  })

  it('keeps clubs and names apart', async () => {
    await savedByVersion(t.db, 1, 'played', 'v1', counting(['seniors']))
    await savedByVersion(t.db, 2, 'played', 'v1', counting(['juniors']))
    await savedByVersion(t.db, 1, 'sessions', 'v1', counting(['list']))
    clearCache()
    const none = counting(['recomputed'])
    expect(await savedByVersion(t.db, 1, 'played', 'v1', none)).toEqual([
      'seniors',
    ])
    expect(await savedByVersion(t.db, 2, 'played', 'v1', none)).toEqual([
      'juniors',
    ])
    expect(await savedByVersion(t.db, 1, 'sessions', 'v1', none)).toEqual([
      'list',
    ])
    expect(none.calls).toBe(0)
  })
})
