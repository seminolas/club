// A real local D1 (workerd, via wrangler's getPlatformProxy) for tests, built
// by applying worker/migrations in order, the way prod got its schema.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'
import type { DB } from '../db'

const workerDir = fileURLToPath(new URL('../..', import.meta.url).href)
const migrationsDir = `${workerDir}/migrations`

/**
 * Statements in a migration file, split at semicolons that end a line, with
 * `--` comments removed as `wrangler d1` does (prod's stored schema has none).
 */
export function migrationStatements(file: string): string[] {
  return readFileSync(`${migrationsDir}/${file}`, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/--[^\n]*/g, '')
    .split(/;[ \t]*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export const migrationFiles = () =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

// Child tables before parents. `roles` keeps the rows migration 0007 seeds.
const DATA_TABLES = [
  'match_players',
  'match_sets',
  'matches',
  'box_players',
  'boxes',
  'attendees',
  'player_roles',
  'player_auth_profiles',
  'session_ranks',
  'sessions',
  'players',
  'clubs',
]

export interface TestDb {
  /** What the app uses: a session pinned to the primary, as in index.ts. */
  db: DB
  raw: D1Database
  /** Empty every data table and reset AUTOINCREMENT counters. */
  clear: () => Promise<void>
  dispose: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: `${workerDir}/wrangler.toml`,
    persist: false,
  })
  const raw = proxy.env.DB
  for (const file of migrationFiles()) {
    const stmts = migrationStatements(file)
    if (stmts.length) await raw.batch(stmts.map((s) => raw.prepare(s)))
  }
  return {
    db: raw.withSession('first-primary'),
    raw,
    clear: async () => {
      await raw.batch([
        ...DATA_TABLES.map((t) => raw.prepare(`DELETE FROM ${t}`)),
        raw.prepare(
          "DELETE FROM sqlite_sequence WHERE name <> 'roles' AND name <> 'd1_migrations'",
        ),
      ])
    },
    dispose: () => proxy.dispose(),
  }
}

/** Every row of a table, ordered by all columns, for comparing whole tables. */
export async function tableRows(
  db: DB,
  table: string,
): Promise<Record<string, unknown>[]> {
  const { results: cols } = await db
    .prepare(`SELECT name FROM pragma_table_info(?)`)
    .bind(table)
    .all<{ name: string }>()
  const { results } = await db
    .prepare(
      `SELECT * FROM ${table} ORDER BY ${cols.map((_, i) => i + 1).join(', ')}`,
    )
    .all<Record<string, unknown>>()
  return results
}
