import { createFileRoute, redirect } from '@tanstack/react-router'
import { furthestStep } from '../../components/session/SessionCard'
import { phaseOf } from '../../lib/session'
import { sessionQuery } from '../../lib/queries'

// A session opens at the furthest step it has reached.
export const Route = createFileRoute('/$club/sessions/$date/')({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQuery(params.club, params.date),
    )
    throw redirect({
      to: '/$club/sessions/$date/$step',
      params: {
        club: params.club,
        date: params.date,
        step: furthestStep(phaseOf(session.status)),
      },
      replace: true,
    })
  },
})
