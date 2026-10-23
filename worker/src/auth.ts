import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { createAuth } from './better-auth'
import type { DB } from './db'
import type { Env } from './types'

type AppContext = Context<{
  Bindings: Env
  Variables: { db: DB; userId?: string }
}>

/** The signed-in BetterAuth session for this request, if any. */
export function getSession(c: AppContext) {
  return createAuth(c.env, c.get('db')).api.getSession({
    headers: c.req.raw.headers,
  })
}

// Admins only: a BetterAuth session whose user has role 'admin'. Leaves the
// user's id in `userId` for the route.
export const requireAdmin = createMiddleware<{
  Bindings: Env
  Variables: { db: DB; userId?: string }
}>(async (c, next) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  if (session.user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  c.set('userId', session.user.id)
  return next()
})
