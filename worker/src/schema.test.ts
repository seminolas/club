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

// What a database enforces, per table, independent of how the SQL was written.
async function structure(raw: D1Database) {
  const q = async <T>(sql: string, ...args: unknown[]) =>
    (
      await raw
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results
  const tables = (
    await q<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
    )
  ).map((row) => row.name)
  const out: Record<string, unknown> = {}
  for (const table of tables) {
    const cols = await q<{
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>('SELECT * FROM pragma_table_info(?)', table)
    const fks = await q<{ table: string; from: string; to: string }>(
      'SELECT * FROM pragma_foreign_key_list(?)',
      table,
    )
    const indexes = await q<{ name: string; unique: number; origin: string }>(
      'SELECT * FROM pragma_index_list(?)',
      table,
    )
    const indexCols = async (name: string) =>
      (
        await q<{ name: string }>(
          'SELECT name FROM pragma_index_info(?) ORDER BY seqno',
          name,
        )
      )
        .map((c) => c.name)
        .join(',')
    out[table] = {
      columns: cols.map((c) => ({
        name: c.name,
        type: c.type.toUpperCase(),
        // INTEGER PRIMARY KEY can't be NULL whether or not it says NOT NULL.
        notnull: c.pk && cols.filter((x) => x.pk).length === 1 ? 1 : c.notnull,
        default: c.dflt_value,
        pk: c.pk,
      })),
      foreignKeys: fks.map((f) => `${f.from} -> ${f.table}.${f.to}`).sort(),
      unique: (
        await Promise.all(
          indexes
            .filter((i) => i.unique && i.origin !== 'pk')
            .map((i) => indexCols(i.name)),
        )
      ).sort(),
      indexes: (
        await Promise.all(
          indexes
            .filter((i) => i.origin === 'c' && !i.unique)
            .map(async (i) => `${i.name}(${await indexCols(i.name)})`),
        )
      ).sort(),
    }
  }
  return out
}

describe('Drizzle schema (src/db/schema.ts)', () => {
  it('matches what the migrations create', async () => {
    const api = await import('drizzle-kit/api')
    const schema = await import('./db/schema')
    const statements = await api.generateSQLiteMigration(
      await api.generateSQLiteDrizzleJson({}),
      await api.generateSQLiteDrizzleJson(schema),
    )
    const fromDrizzle = await createTestDb({ migrations: false })
    try {
      await fromDrizzle.raw.batch(
        statements.map((s) => fromDrizzle.raw.prepare(s)),
      )
      expect(await structure(fromDrizzle.raw)).toEqual(await structure(t.raw))
    } finally {
      await fromDrizzle.dispose()
    }
  }, 60_000)
})
