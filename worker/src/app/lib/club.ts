// The club the page is on (MULTI-CLUB.md): its slug from the URL (/seniors/…)
// and what the UI shows of it. Outside a club's pages, the seniors.
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { clubsQuery } from './queries'

/** The club the app opens on, and the one old links (no club) mean. */
export const DEFAULT_CLUB = 'seniors'

/** The page's club slug (from the URL), or the default club. */
export function useClubSlug(): string {
  const { club }: { club?: string } = useParams({ strict: false })
  return club ?? DEFAULT_CLUB
}

/** The page's club: slug, label ("Seniors"), session title and night. */
export function useClub() {
  const slug = useClubSlug()
  const { data } = useQuery(clubsQuery)
  const club = data?.find((c) => c.slug === slug)
  return {
    slug,
    label: club?.label ?? slug,
    title: club?.title ?? 'Box night',
    /** 0 Sunday … 6 Saturday, or null if not set. */
    weekday: club?.weekday ?? null,
  }
}

/** Day names for a club's night (0 Sunday … 6 Saturday). */
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
