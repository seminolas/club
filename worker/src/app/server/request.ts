// The current request as the shared services see it (src/services), for
// server functions. Server-only.
import { env } from 'cloudflare:workers'
import { getRequestHeaders } from '@tanstack/react-start/server'
import type { ServiceContext } from '../../services/context'
import type { Env } from '../../types'

export function requestContext(): ServiceContext {
  const bindings = env as unknown as Env
  return {
    env: bindings,
    // Every query in the request on the primary, as the API does (index.ts).
    db: bindings.DB.withSession('first-primary'),
    headers: getRequestHeaders(),
  }
}
