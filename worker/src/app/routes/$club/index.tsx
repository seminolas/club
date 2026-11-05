import { createFileRoute, redirect } from '@tanstack/react-router'

// A club's address on its own (/seniors): its landing page's first tab.
export const Route = createFileRoute('/$club/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$club/players', params: { club: params.club } })
  },
})
