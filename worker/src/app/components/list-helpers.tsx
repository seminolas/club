// Shared pieces of the list pages (club-table-lab src/demos/shared.tsx).
import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import type { FilterDef } from './list-table/filters'

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

/**
 * When a check-in was marked (UTC, "YYYY-MM-DD HH:MM:SS"), in NZ time:
 * "7:42pm" today, "Sun 7:42pm" within the week, else "20 Oct".
 */
export function markedTime(at: string, now = Date.now()): string {
  const d = new Date(`${at.replace(' ', 'T')}Z`)
  const day = (t: Date) => t.toLocaleDateString('en-NZ', { timeZone: TZ })
  const time = d
    .toLocaleTimeString('en-NZ', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: TZ,
    })
    .replace(/\s/g, '')
    .toLowerCase()
  if (day(d) === day(new Date(now))) return time
  if (now - d.getTime() < 6 * 864e5)
    return `${d.toLocaleDateString('en-NZ', { weekday: 'short', timeZone: TZ })} ${time}`
  return playedDate(d.toISOString(), now)
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
  /** Full name, as shown in tables (boxes and score sheets use short names). */
  fullName: string
  /** Searchable too, so "Bob" finds Robert. */
  preferredName: string | null
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
