// The clubs the app serves, each a ladder/night with its own settings
// (MULTI-CLUB.md, option C). Read once a minute per Worker instance: clubs
// change rarely, and every request needs its club (the D1 free tier counts
// rows read, MIGRATION.md).
import * as db from '../db'
import type { DB } from '../db'
import { ServiceError } from './context'
import type { ClubRef } from './context'

/** A club's settings (clubs.config). Admin screens will edit them. */
export interface ClubConfig {
  timezone?: string
  hcSubdomain?: string
  minBoxSize?: number
  maxBoxSize?: number
  setsPerMatch?: number
  /** In the club menu, e.g. "Seniors". */
  label?: string
  /** A session's name, e.g. "Tuesday Box". */
  title?: string
  /** The HelloClub event the sync looks for, e.g. "Senior Box". */
  hcEvent?: string
}

/** What the UI needs to know about a club. */
export interface Club extends ClubRef {
  label: string
  title: string
  config: ClubConfig
}

const FRESH_MS = 60_000
let cache: { at: number; clubs: Club[] } | null = null

/** Every club the app serves, in id order. */
export async function listClubs(d: DB): Promise<Club[]> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.clubs
  const clubs = (await db.listClubs(d)).map((row): Club => {
    let config: ClubConfig = {}
    try {
      config = JSON.parse(row.config) as ClubConfig
    } catch {
      // A broken config reads as no settings, not as a broken app.
    }
    return {
      id: row.id,
      slug: row.slug,
      label: config.label ?? row.slug,
      title: config.title ?? 'Box night',
      config,
    }
  })
  cache = { at: Date.now(), clubs }
  return clubs
}

/** The club with this slug; 404 if there's none. */
export async function clubBySlug(d: DB, slug: string): Promise<Club> {
  const club = (await listClubs(d)).find((c) => c.slug === slug)
  if (!club) throw new ServiceError('Club not found', 404)
  return club
}

/** A club by id (a context's club), or null. */
export async function clubById(d: DB, id: number): Promise<Club | null> {
  return (await listClubs(d)).find((c) => c.id === id) ?? null
}

/** For tests: forget the cached clubs. */
export function forgetClubs() {
  cache = null
}
