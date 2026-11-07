// A club's pages: /seniors/…, /juniors/… (MULTI-CLUB.md, option C). Each
// shows only that club's data; an unknown club is "not found". The device
// remembers the club it shows, for / and the header's club menu.
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { rememberClub } from '../../lib/club'
import { clubsQuery } from '../../lib/queries'

export const Route = createFileRoute('/$club')({
  beforeLoad: async ({ context, params }) => {
    const clubs = await context.queryClient.ensureQueryData(clubsQuery)
    if (!clubs.some((c) => c.slug === params.club)) throw notFound()
  },
  component: ClubLayout,
})

function ClubLayout() {
  const { club } = Route.useParams()
  useEffect(() => rememberClub(club), [club])
  return <Outlet />
}
