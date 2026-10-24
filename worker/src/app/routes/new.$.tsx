import { createFileRoute, redirect } from '@tanstack/react-router'

// The new UI was at /new/ while it was built (UI-PORT.md); links to it still
// work.
export const Route = createFileRoute('/new/$')({
  beforeLoad: ({ params }) => {
    throw redirect({ href: `/${params._splat ?? ''}`, statusCode: 301 })
  },
})
