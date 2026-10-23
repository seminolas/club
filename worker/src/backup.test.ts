import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sanitizeDump, splitValues } from './backup'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'

describe('splitting VALUES', () => {
  it('handles strings with commas and quotes, NULL, numbers and blobs', () => {
    expect(splitValues(`'a,b',NULL,12,'O''Neill',X'0A1B',-3.5,''`)).toEqual([
      `'a,b'`,
      'NULL',
      '12',
      `'O''Neill'`,
      `X'0A1B'`,
      '-3.5',
      `''`,
    ])
  })
})

describe('sanitizing a dump', () => {
  const dump = [
    'PRAGMA defer_foreign_keys=TRUE;',
    'CREATE TABLE "session" (id text);',
    `INSERT INTO "players" ("id","name","email") VALUES(1,'Finn O''Neill','finn@example.test');`,
    `INSERT INTO "session" ("id","token","user_id") VALUES('s1','secret-token','u1');`,
    `INSERT INTO "verification" ("id","identifier","value") VALUES('v1','x','secret');`,
    `INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","password","created_at") VALUES('a1','1234567890','google','u1','ya29.secret','1//refresh','eyJ.id.token',NULL,1700000000);`,
    `INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","password","created_at") VALUES('a2','u2','credential','u2',NULL,NULL,NULL,'pbkdf2:10000:aa:bb',1700000000);`,
  ].join('\n')

  it('drops sign-in sessions and verification rows, keeps everything else', () => {
    const out = sanitizeDump(dump)
    expect(out).not.toMatch(
      /secret-token|INSERT INTO "session"|INSERT INTO "verification"/,
    )
    expect(out).toContain(
      `INSERT INTO "players" ("id","name","email") VALUES(1,'Finn O''Neill','finn@example.test');`,
    )
    expect(out).toContain('CREATE TABLE "session" (id text);') // schema kept
  })

  it('blanks account secrets but keeps the Google link', () => {
    const out = sanitizeDump(dump)
    expect(out).not.toMatch(/ya29|1\/\/refresh|eyJ|pbkdf2/)
    expect(out).toContain(
      `VALUES('a1','1234567890','google','u1',NULL,NULL,NULL,NULL,1700000000);`,
    )
  })
})

describe('a sanitized dump restores', () => {
  let t: TestDb
  beforeAll(async () => {
    t = await createTestDb({ migrations: false })
  }, 60_000)
  afterAll(() => t.dispose())

  it('into an empty D1, with the Google links and without secrets', async () => {
    const dump = [
      `CREATE TABLE "user" ("id" text PRIMARY KEY, "email" text);`,
      `CREATE TABLE "account" ("id" text PRIMARY KEY, "account_id" text, "user_id" text, "access_token" text);`,
      `CREATE TABLE "session" ("id" text PRIMARY KEY, "token" text);`,
      `INSERT INTO "user" ("id","email") VALUES('u1','a@example.test');`,
      `INSERT INTO "account" ("id","account_id","user_id","access_token") VALUES('a1','123','u1','ya29.secret');`,
      `INSERT INTO "session" ("id","token") VALUES('s1','tok');`,
    ].join('\n')
    const stmts = sanitizeDump(dump).split('\n').filter(Boolean)
    await t.raw.batch(stmts.map((s) => t.raw.prepare(s)))
    expect(
      (await t.raw.prepare('SELECT * FROM account').all()).results,
    ).toEqual([
      { id: 'a1', account_id: '123', user_id: 'u1', access_token: null },
    ])
    expect(
      await t.raw.prepare('SELECT count(*) AS n FROM session').first(),
    ).toEqual({ n: 0 })
  })
})
