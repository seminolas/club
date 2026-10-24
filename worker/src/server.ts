// Worker entry: the API (Hono, src/index.ts) under /api/*, the live session
// channel's Durable Object, and the new UI (TanStack Start, src/app) for
// every other path that isn't a static file. Static files (the old UI at /)
// are served before the Worker runs.
import startHandler from '@tanstack/react-start/server-entry'
import api from './index'
import type { Env } from './types'

export { SessionRoom } from './live'

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/')) return api.fetch(request, env, ctx)
    return startHandler.fetch(request)
  },
}
