import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_CLUB } from '../lib/club'

// The landing page's first tab, of the default club.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/$club/players', params: { club: DEFAULT_CLUB } })
  },
})
