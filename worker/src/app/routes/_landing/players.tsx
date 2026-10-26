// The Players tab: the club ladder (lab: LadderDemo; old UI: home "Players").
import { Button, FileButton } from '@mantine/core'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import { ListTable } from '../../components/list-table/ListTable'
import {
  Dash,
  SIX_MONTHS,
  helloClubFilter,
  lastPlayedFilter,
  nameLabels,
  playedDate,
} from '../../components/list-helpers'
import type { PersonRow } from '../../components/list-helpers'
import { RankingsHelp } from '../../components/RankingsHelp'
import { importLadderFn } from '../../fns/ladder'
import { generateLeaderboardCSV, parseLeaderboardCSV } from '../../lib/csv'
import { nextTuesday } from '../../lib/dates'
import { shortName } from '../../lib/names'
import { ladderQuery, sessionListQuery, viewerQuery } from '../../lib/queries'
import { confirmAction, toastError, toastOk } from '../../lib/toasts'

export const Route = createFileRoute('/_landing/players')({
  loader: ({ context }) => context.queryClient.ensureQueryData(ladderQuery),
  component: PlayersPage,
})

interface Row extends PersonRow {
  rank: number
  /** Rank by Skill, or null without a game yet. */
  skillRank: number | null
  nights: number
}

function PlayersPage() {
  const { data: viewer } = useSuspenseQuery(viewerQuery)
  const { data: ladder } = useSuspenseQuery(ladderQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const resetFile = useRef<() => void>(null)

  const rows: Row[] = ladder.map((p) => ({
    personId: p.id,
    displayName: shortName(p.name, p.preferredName),
    fullName: p.name,
    lastPlayed: p.lastPlayed,
    helloClub: p.hcMemberId !== null,
    rank: p.rank,
    skillRank: p.skillRank,
    nights: p.nights,
  }))

  const exportCsv = () => {
    const date = nextTuesday()
    const csv = generateLeaderboardCSV(
      ladder.map((p) => p.name),
      date,
    )
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `leaderboard-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importCsv = async (file: File | null) => {
    resetFile.current?.()
    if (!file) return
    const sessions = await queryClient.fetchQuery(sessionListQuery)
    if (sessions[0] && sessions[0].status !== 'closed')
      return toastError(
        new Error(
          'Finish the current session before importing a new leaderboard.',
        ),
      )
    const names = parseLeaderboardCSV(await file.text())
    if (names.length === 0)
      return toastError(new Error('No player rows found in CSV.'))
    confirmAction({
      title: 'Import ladder?',
      message: `Import ${names.length} players and overwrite the current leaderboard?`,
      confirmLabel: 'Import',
      danger: true,
      onConfirm: async () => {
        try {
          await importLadderFn({ data: names })
          await queryClient.invalidateQueries()
          toastOk(`Imported ${names.length} players.`)
        } catch (e) {
          toastError(e)
        }
      },
    })
  }

  return (
    <ListTable<Row>
      records={rows}
      getKey={(r) => r.personId}
      noun={{ one: 'player', many: 'players' }}
      searchText={(r) => `${r.fullName} ${r.displayName}`}
      searchPlaceholder="Find a player…"
      filters={[lastPlayedFilter, helloClubFilter]}
      defaultFilters={{ played: SIX_MONTHS }}
      stickyHeader
      primaryColumn="displayName"
      initialSort={{ column: 'rank', direction: 'asc' }}
      primaryAction={
        viewer.isAdmin
          ? (r) => ({
              label: 'View',
              run: () =>
                void navigate({
                  to: '/players/$id',
                  params: { id: String(r.personId) },
                }),
            })
          : undefined
      }
      title="Ladder"
      actions={
        <>
          <RankingsHelp />
          <Button variant="default" onClick={exportCsv}>
            Export CSV
          </Button>
          {viewer.isAdmin && (
            <FileButton
              onChange={(f) => void importCsv(f)}
              accept=".csv,.txt"
              resetRef={resetFile}
            >
              {(props) => (
                <Button variant="default" {...props}>
                  Import ladder
                </Button>
              )}
            </FileButton>
          )}
        </>
      }
      columns={(inView, query) => {
        const label = nameLabels(inView, query)
        return [
          { accessor: 'rank', title: '#', sortable: true, numeric: true },
          {
            // A statistical estimate of strength (domain/skill.ts), as a rank.
            accessor: 'skillRank',
            title: 'Skill',
            sortable: true,
            numeric: true,
            defaultHidden: true,
            render: (r) =>
              r.skillRank === null ? <Dash /> : `#${r.skillRank}`,
          },
          {
            accessor: 'displayName',
            title: 'Player',
            sortable: true,
            render: (r) => label(r),
          },
          {
            accessor: 'nights',
            title: 'Nights',
            sortable: true,
            sortDescFirst: true,
            numeric: true,
          },
          {
            accessor: 'lastPlayed',
            title: 'Last played',
            sortable: true,
            sortDescFirst: true,
            render: (r) => playedDate(r.lastPlayed),
          },
          {
            accessor: 'helloClub',
            title: 'HelloClub',
            visibleMediaQuery: '(min-width: 36em)',
            render: (r) => (r.helloClub ? 'Linked' : <Dash />),
          },
        ]
      }}
    />
  )
}
