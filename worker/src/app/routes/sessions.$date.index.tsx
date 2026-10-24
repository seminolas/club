import { createFileRoute, redirect } from '@tanstack/react-router'
import { furthestStep } from '../components/session/SessionCard'
import { phaseOf } from '../lib/session'
import { sessionQuery } from '../lib/queries'

// A session opens at the furthest step it has reached.
export const Route = createFileRoute('/sessions/$date/')({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQuery(params.date),
    )
    throw redirect({
      to: '/sessions/$date/$step',
      params: {
        date: params.date,
        step: furthestStep(phaseOf(session.status)),
      },
      replace: true,
    })
  },
})
