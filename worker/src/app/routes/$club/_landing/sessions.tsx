// The Sessions tab: the club's nights (lab: SessionsDemo; old UI: home
// "Sessions"). Each club is one night (MULTI-CLUB.md), so no Night filter.
import { Button, Text } from '@mantine/core'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ListTable } from '../../../components/list-table/ListTable'
import type { FilterDef } from '../../../components/list-table/filters'
import {
  SIX_MONTHS,
  dayStart,
  sessionDate,
} from '../../../components/list-helpers'
import { NewSessionModal } from '../../../components/NewSessionModal'
import { INFO_TEXT } from '../../../lib/colors'
import { sessionListQuery, viewerQuery } from '../../../lib/queries'
import type { SessionListRow } from '../../../../services/sessions'

export const Route = createFileRoute('/$club/_landing/sessions')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(sessionListQuery(params.club)),
  component: SessionsPage,
})

const dateFilter: FilterDef<SessionListRow> = {
  kind: 'within',
  id: 'date',
  label: 'Date',
  date: (s) => dayStart(s.date),
  // The Date column shows it; no "Date: Apr 2026" under hidden matches.
  column: 'date',
}

function SessionsPage() {
  const { club } = Route.useParams()
  const { data: viewer } = useSuspenseQuery(viewerQuery)
  const { data: sessions } = useSuspenseQuery(sessionListQuery(club))
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const view = (date: string) =>
    void navigate({ to: '/$club/sessions/$date', params: { club, date } })

  return (
    <>
      <ListTable<SessionListRow>
        records={sessions}
        getKey={(s) => s.date}
        noun={{ one: 'session', many: 'sessions' }}
        searchText={(s) => `${sessionDate(s.date)} ${s.date.slice(0, 4)}`}
        searchAlso={{ label: 'Played', texts: (s) => s.players }}
        searchPlaceholder="Find a date or player…"
        filters={[dateFilter]}
        defaultFilters={{ date: SIX_MONTHS }}
        stickyHeader
        hideColumnChooser
        primaryColumn="date"
        initialSort={{ column: 'date', direction: 'desc' }}
        primaryAction={(s) => ({ label: 'View', run: () => view(s.date) })}
        title="Sessions"
        actions={
          viewer.isAdmin ? (
            <Button onClick={() => setCreating(true)}>New session</Button>
          ) : undefined
        }
        columns={[
          {
            accessor: 'date',
            title: 'Date',
            sortable: true,
            sortDescFirst: true,
            render: (s) => sessionDate(s.date),
          },
          {
            accessor: 'playerCount',
            title: 'Players',
            sortable: true,
            sortDescFirst: true,
            numeric: true,
          },
          {
            accessor: 'status',
            title: 'Status',
            render: (s) =>
              s.status === 'closed' ? (
                <Text size="sm" c={INFO_TEXT}>
                  Closed
                </Text>
              ) : (
                <Text size="sm" fw={600} c="teal">
                  Open
                </Text>
              ),
          },
        ]}
      />
      <NewSessionModal
        opened={creating}
        club={club}
        sessions={sessions}
        onClose={() => setCreating(false)}
        onCreated={(date) => {
          setCreating(false)
          view(date)
        }}
      />
    </>
  )
}
