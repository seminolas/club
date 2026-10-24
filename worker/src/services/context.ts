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

/** A refusal a service can give, with the HTTP status the API answers with. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(message)
  }
}

/** Admins only (as the API's requireAdmin); returns the admin's user id. */
export async function requireAdmin(ctx: ServiceContext): Promise<string> {
  const session = await signedIn(ctx)
  if (!session) throw new ServiceError('Unauthorized', 401)
  if (session.user.role !== 'admin') throw new ServiceError('Forbidden', 403)
  return session.user.id
}
