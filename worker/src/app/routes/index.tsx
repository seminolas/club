import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_CLUB, rememberedClub } from '../lib/club'
import { clubsQuery } from '../lib/queries'

// The landing page's first tab, of the club this device last showed (if it
// still exists), else the default club.
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const last = rememberedClub()
    const clubs = last
      ? await context.queryClient.ensureQueryData(clubsQuery)
      : []
    const club = clubs.some((c) => c.slug === last) ? last! : DEFAULT_CLUB
    throw redirect({ to: '/$club/players', params: { club } })
  },
})
