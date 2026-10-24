// What a service needs from the request: the Worker's bindings, the request's
// D1 session and its headers (for the sign-in cookie). The Hono routes
// (src/index.ts) and the new UI's server functions (src/app) both build one,
// so both run the same code (UI-PORT.md, Architecture).
import { createAuth } from '../better-auth'
import type { DB } from '../db'
import type { Env } from '../types'

export interface ServiceContext {
  env: Env
  db: DB
  headers: Headers
}

// Hard-coded to club_id=1 for now; extend to subdomain routing when multi-club.
export const CLUB_ID = 1

/** The signed-in BetterAuth session for this request, if any. */
export function signedIn(ctx: ServiceContext) {
  return createAuth(ctx.env, ctx.db).api.getSession({ headers: ctx.headers })
}
