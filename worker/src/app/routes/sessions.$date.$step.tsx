import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { STEPS, furthestStep } from '../components/session/SessionCard'
import type { StepId } from '../components/session/SessionCard'
import { SessionPage } from '../components/session/SessionPage'
import { phaseOf } from '../lib/session'
import {
  ladderQuery,
  sessionListQuery,
  sessionQuery,
  viewerQuery,
} from '../lib/queries'

export const Route = createFileRoute('/sessions/$date/$step')({
  beforeLoad: ({ params }) => {
    if (!STEPS.some((s) => s.id === params.step)) throw notFound()
  },
  loader: async ({ context, params }) => {
    const { queryClient } = context
    const [session] = await Promise.all([
      queryClient.ensureQueryData(sessionQuery(params.date)),
      queryClient.ensureQueryData(viewerQuery),
      queryClient.ensureQueryData(ladderQuery),
      queryClient.ensureQueryData(sessionListQuery),
    ])
    // A step the session hasn't reached opens the furthest one instead.
    const furthest = furthestStep(phaseOf(session.status))
    const order = STEPS.map((s) => s.id)
    if (order.indexOf(params.step as StepId) > order.indexOf(furthest))
      throw redirect({
        to: '/sessions/$date/$step',
        params: { date: params.date, step: furthest },
        replace: true,
      })
  },
  component: function SessionRoute() {
    const { date, step } = Route.useParams()
    return <SessionPage key={date} date={date} step={step as StepId} />
  },
})
