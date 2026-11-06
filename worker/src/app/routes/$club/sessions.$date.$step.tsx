import {
  createFileRoute,
  notFound,
  redirect,
  useParams,
} from '@tanstack/react-router'
import { sessionDate } from '../../components/list-helpers'
import type { Crumbs } from '../../components/PageCrumbs'
import { STEPS, furthestStep } from '../../components/session/SessionCard'
import type { StepId } from '../../components/session/SessionCard'
import { SessionPage } from '../../components/session/SessionPage'
import { useClub } from '../../lib/club'
import { phaseOf } from '../../lib/session'
import {
  ladderQuery,
  sessionListQuery,
  sessionQuery,
  viewerQuery,
} from '../../lib/queries'

// "Tuesday Box · 20 Oct" (the club's session title; the weekday would repeat
// it; the year as in the Sessions list), "20 Oct" on phones. Typed, as the
// route's own type depends on it.
function useCrumbs(): Crumbs {
  const { date = '' }: { date?: string } = useParams({ strict: false })
  const { title } = useClub()
  const day = sessionDate(date).replace(/^\S+ /, '')
  return {
    parent: { label: 'Sessions', to: '/$club/sessions' },
    current: `${title} · ${day}`,
    short: day,
  }
}

export const Route = createFileRoute('/$club/sessions/$date/$step')({
  staticData: { crumbs: useCrumbs },
  beforeLoad: ({ params }) => {
    if (!STEPS.some((s) => s.id === params.step)) throw notFound()
  },
  loader: async ({ context, params }) => {
    const { queryClient } = context
    const [session] = await Promise.all([
      queryClient.ensureQueryData(sessionQuery(params.club, params.date)),
      queryClient.ensureQueryData(viewerQuery),
      queryClient.ensureQueryData(ladderQuery(params.club)),
      queryClient.ensureQueryData(sessionListQuery(params.club)),
    ])
    // A step the session hasn't reached opens the furthest one instead.
    const furthest = furthestStep(phaseOf(session.status))
    const order = STEPS.map((s) => s.id)
    if (order.indexOf(params.step as StepId) > order.indexOf(furthest))
      throw redirect({
        to: '/$club/sessions/$date/$step',
        params: { club: params.club, date: params.date, step: furthest },
        replace: true,
      })
  },
  component: function SessionRoute() {
    const { club, date, step } = Route.useParams()
    return (
      <SessionPage
        key={`${club}/${date}`}
        club={club}
        date={date}
        step={step as StepId}
      />
    )
  },
})
