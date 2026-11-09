// Query plans for reads that run on every page view: each must look its rows
// up through an index, never scan a whole table (D1 bills rows read, and the
// free plan allows 5 million a day across prod and staging). The app's own
// SQL is captured as it runs, then explained with the same parameters.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as db from './db'
import type { DB } from './db'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
  await seed(t.db)
}, 60_000)
afterAll(() => t.dispose())

/** Each statement `run` prepares, with its parameters. */
async function captured(run: (d: DB) => Promise<unknown>) {
  const seen: { sql: string; params: unknown[] }[] = []
  const d: DB = {
    prepare: (sql: string) => {
      const entry = { sql, params: [] as unknown[] }
      seen.push(entry)
      const s = t.raw.prepare(sql)
      const wrap = (st: D1PreparedStatement): D1PreparedStatement =>
        Object.assign(Object.create(st) as D1PreparedStatement, {
          bind: (...p: unknown[]) => {
            entry.params = p
            return wrap(st.bind(...p))
          },
        })
      return wrap(s)
    },
    batch: (s) => t.raw.batch(s),
  }
  await run(d)
  return seen
}

async function plans(run: (d: DB) => Promise<unknown>) {
  const out: string[] = []
  for (const { sql, params } of await captured(run)) {
    const { results } = await t.raw
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...params)
      .all<{ detail: string }>()
    out.push(...results.map((r) => r.detail))
  }
  return out
}

const scans = (p: string[]) => p.filter((d) => /^SCAN /.test(d))

describe('query plans', () => {
  it('the ladder: the latest session’s ranks by (session, phase), in rank order', async () => {
    const p = await plans((d) => db.getLeaderboardPlayers(d, 1))
    expect(scans(p)).toEqual([])
    expect(p).toContain(
      'SEARCH session_ranks USING INDEX session_ranks_session_phase (session_id=? AND phase=?)',
    )
    expect(p.join('\n')).not.toMatch(/TEMP B-TREE/)
  })

  it('signing in: the email match uses players_email_key', async () => {
    const p = await plans((d) =>
      db.autoLinkByEmail(d, 'no-such-user', ' Nobody@Example.test '),
    )
    expect(scans(p)).toEqual([])
    expect(p.join('\n')).toMatch(/USING INDEX players_email_key/)
  })

  it('saved totals: one row by primary key', async () => {
    const p = await plans((d) => db.getSavedTotal(d, 1, 'played'))
    expect(scans(p)).toEqual([])
  })
})
