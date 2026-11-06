// What a service needs from the request: the Worker's bindings, the request's
// D1 session, its headers (for the sign-in cookie) and the club it's for. The
// Hono routes (src/index.ts) and the new UI's server functions (src/app) both
// build one, so both run the same code (UI-PORT.md, Architecture).
import { createAuth } from '../better-auth'
import type { DB } from '../db'
import type { Env } from '../types'

/** Which club a request is for (MULTI-CLUB.md: a club per ladder/night). */
export interface ClubRef {
  id: number
  /** In URLs: /seniors/…, /juniors/… */
  slug: string
}

export interface ServiceContext {
  env: Env
  db: DB
  headers: Headers
  club: ClubRef
}

/**
 * The club the REST API (/api/…) serves: today's club, the seniors. The new
 * UI names its club in the URL instead (app/server/request.ts).
 */
export const SENIORS: ClubRef = { id: 1, slug: 'seniors' }

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
