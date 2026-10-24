import { createFileRoute, redirect } from '@tanstack/react-router'

// The landing page's first tab.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/players' })
  },
})
