import { queryOptions } from '@tanstack/react-query'
import { adminClubsFn, hcSeriesFn } from '../fns/clubs'
import { ladderFn } from '../fns/ladder'
import { playerFn } from '../fns/players'
import { sessionFn } from '../fns/session'
import { clubsFn, sessionListFn } from '../fns/sessions'
import { claimablePlayersFn, getViewerFn } from '../fns/viewer'

/** How long loaded data counts as fresh (the query client's staleTime). */
export const FRESH_MS = 10_000

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewerFn(),
})

export const claimableQuery = queryOptions({
  queryKey: ['claimable'],
  queryFn: () => claimablePlayersFn(),
})

/** The clubs the app serves (slug, label, session title). */
export const clubsQuery = queryOptions({
  queryKey: ['clubs'],
  queryFn: () => clubsFn(),
  // Clubs change rarely (admin screens, later).
  staleTime: 5 * 60_000,
})

// A club's own data: keyed by its slug first, so a club's queries can be
// found (and refreshed) together.
export const ladderQuery = (club: string) =>
  queryOptions({
    queryKey: [club, 'ladder'],
    queryFn: () => ladderFn({ data: club }),
  })

export const sessionListQuery = (club: string) =>
  queryOptions({
    queryKey: [club, 'sessions'],
    queryFn: () => sessionListFn({ data: club }),
  })

export const playerQuery = (club: string, id: number) =>
  queryOptions({
    queryKey: [club, 'player', id],
    queryFn: () => playerFn({ data: { club, id } }),
  })

export const sessionQuery = (club: string, date: string) =>
  queryOptions({
    queryKey: [club, 'session', date],
    queryFn: () => sessionFn({ data: { club, date } }),
  })

// ── Admin (/admin/clubs) ──────────────────────────────────────────────────────

export const adminClubsQuery = queryOptions({
  queryKey: ['admin', 'clubs'],
  queryFn: () => adminClubsFn(),
})

/** HelloClub's recurring series (a read-only call; changes rarely). */
export const hcSeriesQuery = queryOptions({
  queryKey: ['admin', 'hc-series'],
  queryFn: () => hcSeriesFn(),
  staleTime: 5 * 60_000,
  retry: false,
})
