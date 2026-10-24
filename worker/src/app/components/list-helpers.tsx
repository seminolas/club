// Shared pieces of the list pages (club-table-lab src/demos/shared.tsx).
import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { matchesSearch } from './list-table/filters'
import type { FilterDef } from './list-table/filters'
import { viewLabels } from '../lib/names'

const TZ = 'Pacific/Auckland'

/**
 * A date (YYYY-MM-DD) as an instant on that day in New Zealand, wherever this
 * runs: midnight UTC is 12:00 or 13:00 there. (Local noon, as the lab had it,
 * is the next day in NZ when the server, on UTC, renders the page.)
 */
export function dayStart(date: string): string {
  return `${date}T00:00:00Z`
}

/** A date (YYYY-MM-DD or ISO) as "14 Oct" within ~11 months, else "Mar 2023". */
export function playedDate(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never'
  const d = new Date(iso.length === 10 ? dayStart(iso) : iso)
  const recent = now - d.getTime() < 330 * 864e5
  return d.toLocaleDateString(
    'en-NZ',
    recent
      ? { day: 'numeric', month: 'short', timeZone: TZ }
      : { month: 'short', year: 'numeric', timeZone: TZ },
  )
}

/** "Tue 20 Oct", with the year once it's ~11 months back: "Tue 14 Oct 2025". */
export function sessionDate(date: string, now = Date.now()): string {
  const d = new Date(dayStart(date))
  const recent = now - d.getTime() < 330 * 864e5
  const part = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-NZ', { ...o, timeZone: TZ })
  return [
    part({ weekday: 'short' }),
    part({ day: 'numeric' }),
    part({ month: 'short' }),
    !recent && part({ year: 'numeric' }),
  ]
    .filter(Boolean)
    .join(' ')
}

export function Dash(): ReactNode {
  return (
    <Text size="sm" c="dimmed" span>
      —
    </Text>
  )
}

export const SIX_MONTHS = { n: 6, unit: 'month' } as const

/** A row of a list of people. */
export interface PersonRow {
  personId: number
  /** Short name (preferred, else first). */
  displayName: string
  fullName: string
  lastPlayed: string | null
  helloClub: boolean
}

export const lastPlayedFilter: FilterDef<PersonRow> = {
  kind: 'within',
  id: 'played',
  label: 'Last played',
  date: (p) => (p.lastPlayed ? dayStart(p.lastPlayed) : null),
}

export const helloClubFilter: FilterDef<PersonRow> = {
  kind: 'options',
  id: 'hc',
  label: 'HelloClub',
  column: 'helloClub',
  options: [
    {
      value: 'linked',
      label: 'Linked',
      pill: 'HelloClub: linked',
      test: (p) => p.helloClub,
    },
    {
      value: 'unlinked',
      label: 'Not linked',
      pill: 'HelloClub: not linked',
      test: (p) => !p.helloClub,
    },
  ],
}

/**
 * Display-name labels for a view, plus: while searching, a row whose short
 * label doesn't contain the search shows its full name, so it's clear why it
 * matched ("wright" → "Oscar Wright", not "Oscar").
 */
export function nameLabels<
  TPerson extends { personId: number; displayName: string; fullName: string },
>(inView: TPerson[], query: string) {
  const labels = viewLabels(
    inView.map((r) => ({ ...r, id: String(r.personId) })),
  )
  return (r: TPerson) => {
    const label = labels.get(String(r.personId)) ?? r.displayName
    return query.trim() && !matchesSearch(label, query) ? r.fullName : label
  }
}
