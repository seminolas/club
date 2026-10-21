import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import prodSchema from './test/fixtures/prod-schema.json'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'

// prod-schema.json: sqlite_master from club-prod (structure only), captured
// 2026-10-21. Refresh it if prod's schema changes outside migrations.
// Compares structure, not formatting: prod's stored SQL keeps comments and
// layout on some tables but not others (applied different ways over time).
const normalise = (sql: string | null) =>
  (sql ?? '')
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim()

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())

describe('migrations', () => {
  it('reproduce prod’s schema exactly', async () => {
    const { results } = await t.raw
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type, name",
      )
      .all<{ type: string; name: string; tbl_name: string; sql: string }>()
    const shape = (rows: typeof results) =>
      rows.map((r) => ({ ...r, sql: normalise(r.sql) }))
    expect(shape(results)).toEqual(shape(prodSchema))
  })
})
