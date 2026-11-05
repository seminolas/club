// The current request as the shared services see it (src/services), for
// server functions. Server-only.
import { env } from 'cloudflare:workers'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { clubBySlug } from '../../services/clubs'
import { SENIORS } from '../../services/context'
import type { ServiceContext } from '../../services/context'
import type { Env } from '../../types'

/**
 * For the club the page is on (its slug, from the URL), or the seniors for
 * what isn't a club's own (who's signed in). An unknown club is a 404.
 */
export async function requestContext(club?: string): Promise<ServiceContext> {
  const bindings = env as unknown as Env
  // Every query in the request on the primary, as the API does (index.ts).
  const db = bindings.DB.withSession('first-primary')
  return {
    env: bindings,
    db,
    headers: getRequestHeaders(),
    club: club === undefined ? SENIORS : await clubBySlug(db, club),
  }
}
