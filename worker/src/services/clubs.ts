// The clubs the app serves, each a ladder/night with its own settings
// (MULTI-CLUB.md, option C), and their admin screens (/admin/clubs). Read
// once a minute per Worker instance: clubs change rarely, and every request
// needs its club (the D1 free tier counts rows read, MIGRATION.md).
import * as db from '../db'
import type { DB } from '../db'
import { ServiceError, requireAdmin } from './context'
import type { ClubRef, ServiceContext } from './context'
import { HcError } from './players'

/** A club's settings (clubs.config), edited on its admin page. */
export interface ClubConfig {
  /** In the club menu and admin pages, e.g. "Seniors". */
  label?: string
  /** A session's name, e.g. "Tuesday Box". */
  title?: string
  /** The night it plays: 0 Sunday … 6 Saturday. */
  weekday?: number
  /**
   * The HelloClub recurring series its sessions belong to: the sync uses
   * the series' event on the session's date. Junior series change each
   * school term, so this is relinked then.
   */
  hcSeries?: { id: string; name: string }
  /** Before a series is linked: an event name to look for ("Senior Box"). */
  hcEvent?: string
}

/** What the UI needs to know about a club. */
export interface Club extends ClubRef {
  label: string
  title: string
  /** 0 Sunday … 6 Saturday, or null if not set. */
  weekday: number | null
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
      weekday: validWeekday(config.weekday) ? config.weekday : null,
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

/** Forget the cached clubs (after a change; tests). */
export function forgetClubs() {
  cache = null
}

const validWeekday = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6

// ── Admin (/admin/clubs) ─────────────────────────────────────────────────────

/** A row of the admin clubs list. */
export interface ClubSummary {
  slug: string
  label: string
  title: string
  weekday: number | null
  hcSeries: { id: string; name: string } | null
  /** People on its ladder now. */
  players: number
  /** Its latest session's date, or null. */
  lastSession: string | null
}

export async function adminClubs(ctx: ServiceContext): Promise<ClubSummary[]> {
  await requireAdmin(ctx)
  const [clubs, latest] = await Promise.all([
    listClubs(ctx.db),
    db.latestSessionDates(ctx.db),
  ])
  return Promise.all(
    clubs.map(async (c) => ({
      slug: c.slug,
      label: c.label,
      title: c.title,
      weekday: c.weekday,
      hcSeries: c.config.hcSeries ?? null,
      players: (await db.getLeaderboardPlayers(ctx.db, c.id)).length,
      lastSession: latest.get(c.id) ?? null,
    })),
  )
}

/** Words that can't be a club's address (they're pages of their own). */
const RESERVED = new Set(['admin', 'api', 'players', 'sessions', 'new'])

export interface NewClub {
  label: string
  slug: string
  weekday: number
}

/** A new club: its name, address (/slug, fixed from now on) and night. */
export async function createClub(ctx: ServiceContext, input: NewClub) {
  await requireAdmin(ctx)
  const label = input.label?.trim()
  const slug = input.slug?.trim().toLowerCase()
  if (!label) throw new ServiceError('A name is required', 400)
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new ServiceError(
      'The address can use lower-case letters, digits and dashes',
      400,
    )
  if (RESERVED.has(slug))
    throw new ServiceError(`“${slug}” can’t be a club’s address`, 400)
  if (!validWeekday(input.weekday))
    throw new ServiceError('Pick the night it plays', 400)
  forgetClubs()
  if ((await listClubs(ctx.db)).some((c) => c.slug === slug))
    throw new ServiceError(`There’s already a club at /${slug}`, 409)
  const config: ClubConfig = { label, title: label, weekday: input.weekday }
  await db.insertClub(ctx.db, label, slug, JSON.stringify(config))
  forgetClubs()
  return { slug }
}

/** What an admin can change on a club's page (the address stays). */
export interface ClubChange {
  label?: string
  title?: string
  weekday?: number
  /** null unlinks. */
  hcSeries?: { id: string; name: string } | null
}

export async function updateClub(
  ctx: ServiceContext,
  slug: string,
  change: ClubChange,
) {
  await requireAdmin(ctx)
  forgetClubs()
  const club = await clubBySlug(ctx.db, slug)
  const config: ClubConfig = { ...club.config }
  if (change.label !== undefined) {
    if (!change.label.trim()) throw new ServiceError('A name is required', 400)
    config.label = change.label.trim()
  }
  if (change.title !== undefined) {
    if (!change.title.trim())
      throw new ServiceError('A session title is required', 400)
    config.title = change.title.trim()
  }
  if (change.weekday !== undefined) {
    if (!validWeekday(change.weekday))
      throw new ServiceError('Pick the night it plays', 400)
    config.weekday = change.weekday
  }
  if (change.hcSeries !== undefined) {
    if (change.hcSeries === null) delete config.hcSeries
    else if (!change.hcSeries.id || !change.hcSeries.name)
      throw new ServiceError('Pick a HelloClub series', 400)
    else
      config.hcSeries = { id: change.hcSeries.id, name: change.hcSeries.name }
  }
  await db.updateClubConfig(ctx.db, club.id, JSON.stringify(config))
  forgetClubs()
}

// ── HelloClub series (read-only calls) ───────────────────────────────────────

/** A recurring HelloClub series, from its upcoming events. */
export interface HcSeries {
  id: string
  name: string
  category: string | null
  /** Its next event's start (ISO). */
  next: string
  /** Upcoming events seen. */
  count: number
}

interface HcEvent {
  id: string
  name: string
  series?: string | null
  isRecurring?: boolean
  startDate: string
  activity?: { identifier?: string } | null
  categories?: { name: string }[]
}

/** HelloClub's events between two dates, page by page (100 a page). */
export async function hcEvents(
  ctx: ServiceContext,
  from: Date,
  to: Date,
): Promise<HcEvent[]> {
  const base = `https://${ctx.env.HC_CLUB_ID}.helloclub.com/api`
  const out: HcEvent[] = []
  // At most 5 pages: enough for weeks of the venue's events.
  for (let offset = 0; offset < 500; offset += 100) {
    const res = await fetch(
      `${base}/event?fromDate=${from.toISOString()}&toDate=${to.toISOString()}&sort=startDate&limit=100&offset=${offset}`,
      {
        headers: {
          'X-Api-Key': ctx.env.HC_API_KEY,
          Accept: 'application/json',
        },
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new HcError(
        `HelloClub API error: ${res.status}${body ? ' — ' + body.slice(0, 200) : ''}`,
      )
    }
    const { events = [] } = await res.json<{ events?: HcEvent[] }>()
    out.push(...events)
    if (events.length < 100) break
  }
  return out
}

/**
 * The recurring badminton series with events in the next six weeks, by when
 * their next event starts: what a club can be linked to.
 */
export async function hcSeries(ctx: ServiceContext): Promise<HcSeries[]> {
  await requireAdmin(ctx)
  const from = new Date()
  const events = await hcEvents(
    ctx,
    from,
    new Date(from.getTime() + 42 * 864e5),
  )
  const bySeries = new Map<string, HcSeries>()
  for (const e of events) {
    if (!e.series || !e.isRecurring) continue
    // The hall's events (badminton and pickleball); not the lounge.
    if (e.activity?.identifier && e.activity.identifier !== 'badminton-hall')
      continue
    const seen = bySeries.get(e.series)
    if (seen) seen.count++
    else
      bySeries.set(e.series, {
        id: e.series,
        name: e.name,
        category: e.categories?.[0]?.name ?? null,
        next: e.startDate,
        count: 1,
      })
  }
  return [...bySeries.values()].sort((a, b) => a.next.localeCompare(b.next))
}

/** The HelloClub event a club's session on this date syncs to, or why not. */
export function pickHcEvent(
  club: Club,
  events: { id: string; name: string; series?: string | null }[],
): { event: { id: string; name: string } } | { error: string } {
  const series = club.config.hcSeries
  if (series) {
    const event = events.find((e) => e.series === series.id)
    return event
      ? { event }
      : {
          error: `No “${series.name}” event on this date. If a new term’s series started, link it on the club’s admin page.`,
        }
  }
  const name = club.config.hcEvent ?? 'Senior Box'
  const event = events.find((e) => e.name?.includes(name))
  return event ? { event } : { error: `No ${name} event found` }
}
