// BetterAuth (S4): sign-in sessions over our D1, through Drizzle. Google is
// the sign-in for real people. Email + password exists only for the synthetic
// test accounts on staging (TEST_LOGIN=1, set only in wrangler.toml's
// [env.staging.vars]); sign-up is off, so nobody can create one.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { orm } from './db'
import type { DB } from './db'
import * as schema from './db/schema'
import { hashPassword, verifyPassword } from './test-login'
import type { Env } from './types'

export function testLoginEnabled(env: Env): boolean {
  if (env.TEST_LOGIN !== '1') return false
  const host = new URL(env.BETTER_AUTH_URL).hostname
  if (host !== 'localhost' && !host.includes('staging')) {
    throw new Error('TEST_LOGIN is only allowed on staging or localhost')
  }
  return true
}

export function createAuth(env: Env, db: DB) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(orm(db), { provider: 'sqlite', schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    emailAndPassword: testLoginEnabled(env)
      ? {
          enabled: true,
          disableSignUp: true,
          password: {
            hash: hashPassword,
            verify: ({ hash, password }) => verifyPassword(password, hash),
          },
        }
      : { enabled: false },
    plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] })],
  })
}
