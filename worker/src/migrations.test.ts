// Data migrations, checked on the fixture club: migrate up to the one before,
// load data, apply the migration, check the result.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'

describe('0011_better_auth: Google links become BetterAuth users', () => {
  let t: TestDb
  beforeAll(async () => {
    t = await createTestDb({ upTo: '0010_session_indexes.sql' })
    await seed(t.db)
    // A second Google account for Aroha, and a Facebook link for Ben.
    await t.raw.batch([
      t.raw.prepare(
        "INSERT INTO player_auth_profiles (player_id, provider, provider_id, email) VALUES (1, 'google', 'sub-aroha-work', 'Aroha@Work.example')",
      ),
      t.raw.prepare(
        "INSERT INTO player_auth_profiles (player_id, provider, provider_id, email) VALUES (2, 'facebook', 'fb-ben', 'ben@example.test')",
      ),
    ])
    await applyMigrations(t.raw, {
      from: '0011_better_auth.sql',
      upTo: '0011_better_auth.sql',
    })
  }, 60_000)
  afterAll(() => t.dispose())

  const all = async <T>(sql: string) =>
    (await t.raw.prepare(sql).all<T>()).results

  it('creates one user per player with a Google link, admins by role', async () => {
    const users = await all<Record<string, unknown>>(
      'SELECT id, name, email, email_verified, role, created_at > 0 AS dated FROM user ORDER BY id',
    )
    expect(users).toEqual([
      // Aroha: owner + admin, two Google accounts; email from the first.
      {
        id: 'player-1',
        name: 'Aroha Ngata',
        email: 'aroha@example.test',
        email_verified: 1,
        role: 'admin',
        dated: 1,
      },
      // Liam is archived but keeps his login; his link has no email.
      {
        id: 'player-13',
        name: 'Liam Gone',
        email: 'player-13@no-email.invalid',
        email_verified: 1,
        role: 'user',
        dated: 1,
      },
    ])
  })

  it('creates a Google account per link, keyed by Google’s id', async () => {
    expect(
      await all(
        'SELECT id, account_id, provider_id, user_id FROM account ORDER BY id',
      ),
    ).toEqual([
      {
        id: 'google-1',
        account_id: 'sub-aroha',
        provider_id: 'google',
        user_id: 'player-1',
      },
      {
        id: 'google-2',
        account_id: 'sub-liam',
        provider_id: 'google',
        user_id: 'player-13',
      },
      {
        id: 'google-3',
        account_id: 'sub-aroha-work',
        provider_id: 'google',
        user_id: 'player-1',
      },
    ])
  })

  it('links those players to their user; others (incl. Facebook-only) stay unlinked', async () => {
    expect(
      await all(
        'SELECT id, user_id FROM players WHERE user_id IS NOT NULL ORDER BY id',
      ),
    ).toEqual([
      { id: 1, user_id: 'player-1' },
      { id: 13, user_id: 'player-13' },
    ])
  })

  it('leaves the old tables as they were', async () => {
    expect(await all('SELECT count(*) AS n FROM player_auth_profiles')).toEqual(
      [{ n: 4 }],
    )
    expect(await all('SELECT count(*) AS n FROM player_roles')).toEqual([
      { n: 3 },
    ])
  })
})
