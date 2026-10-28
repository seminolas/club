// The Results step: one row per player who played, with tonight's ladder
// movement (old UI: Wrap-up's "Post-game ranking") and the lab's Stats table
// columns (club-table-lab SessionStatsDemo). Player, Box (# / Players),
// Place in box (Finish) and Ranking show by default; Start, Matches, Games
// and Points are in Columns. The whole ladder stays on the Players tab.
import type { ReactNode } from 'react'
import { Count, Delta, NoValue, Percent } from '../list-table/cells'
import type { ListColumnGroup } from '../list-table/columns'
import { ListTable } from '../list-table/ListTable'
import { nameLabels } from '../list-helpers'
import { shortName } from '../../lib/names'
import { boxStandings } from '../../lib/session'
import type { Session } from '../../lib/session'
import { SessionStats } from './SessionStats'

/** Wider than a phone: phones start with Player, Box # and Ranking. */
const WIDE = '(min-width: 36em)'

interface Row {
  personId: number
  displayName: string
  fullName: string
  box: number
  /** Position in the box at the start (ladder order), from 1. */
  boxStart: number
  /** Final placing in the box. */
  boxFinish: number
  boxSize: number
  rankBefore: number | null
  rankAfter: number | null
  /** Places moved up (positive) or down (negative); null if new tonight. */
  rankChange: number | null
  matches: number
  matchesWon: number
  matchesLost: number
  matchDiff: number
  matchWinPct: number | null
  // Games in the UI, sets in the domain.
  sets: number
  setsWon: number
  setsLost: number
  gameDiff: number
  setWinPct: number | null
  pointsFor: number
  pointsAgainst: number
  pointsDiff: number
}

export function ResultsStep(props: {
  session: Session
  /** Preferred names by player id. */
  preferred: Map<number, string | null>
  header: ReactNode
  stickyTop: number
}) {
  const { session } = props
  const before = new Map(session.leaderboardBefore.map((p, i) => [p.id, i + 1]))
  const after = new Map(
    (session.leaderboardAfter ?? []).map((p, i) => [p.id, i + 1]),
  )
  const ladderBefore = session.leaderboardBefore.map((p) => p.id)
  const share = (won: number, total: number) => (total ? won / total : null)
  const rows: Row[] = session.boxes.flatMap((box, bi) =>
    boxStandings(box, ladderBefore).map((s) => {
      const p = box.players[s.position]
      const b = before.get(p.id) ?? null
      const a = after.get(p.id) ?? null
      const sets = s.setsWon + s.setsLost
      const lost = s.gamesPlayed - s.gamesWon
      return {
        personId: p.id,
        fullName: p.name,
        displayName: shortName(p.name, props.preferred.get(p.id)),
        box: bi + 1,
        boxStart: s.position + 1,
        boxFinish: s.placing,
        boxSize: box.players.length,
        rankBefore: b,
        rankAfter: a,
        rankChange: b !== null && a !== null ? b - a : null,
        matches: s.gamesPlayed,
        matchesWon: s.gamesWon,
        matchesLost: lost,
        matchDiff: s.gamesWon - lost,
        matchWinPct: share(s.gamesWon, s.gamesPlayed),
        sets,
        setsWon: s.setsWon,
        setsLost: s.setsLost,
        gameDiff: s.setsWon - s.setsLost,
        setWinPct: share(s.setsWon, sets),
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        pointsDiff: s.pointsFor - s.pointsAgainst,
      }
    }),
  )

  const names = new Map(rows.map((r) => [r.personId, r.displayName]))

  return (
    <ListTable<Row>
      records={rows}
      getKey={(r) => r.personId}
      noun={{ one: 'player', many: 'players' }}
      searchText={(r) => `${r.fullName} ${r.displayName}`}
      searchPlaceholder="Find a player…"
      stickyHeader
      stickyTop={props.stickyTop}
      header={props.header}
      intro={
        <SessionStats session={session} name={(id) => names.get(id) ?? ''} />
      }
      primaryColumn="displayName"
      initialSort={{ column: 'rankBefore', direction: 'asc' }}
      filters={[
        {
          kind: 'options',
          id: 'box',
          label: 'Box',
          multiple: true,
          anyLabel: 'Any box',
          onlyLabel: 'Only these boxes',
          counts: false,
          column: 'box',
          options: session.boxes.map((_, i) => ({
            value: String(i + 1),
            label: `Box ${i + 1}`,
            short: String(i + 1),
            test: (r: Row) => r.box === i + 1,
          })),
        },
        {
          kind: 'options',
          id: 'move',
          label: 'Ladder change',
          multiple: true,
          anyLabel: 'Any change',
          onlyLabel: 'Only these',
          column: 'rankChange',
          options: [
            {
              value: 'up',
              label: 'Moved up',
              test: (r) => (r.rankChange ?? 0) > 0,
            },
            {
              value: 'same',
              label: 'Stayed',
              test: (r) => r.rankChange === 0,
            },
            {
              value: 'down',
              label: 'Moved down',
              test: (r) => (r.rankChange ?? 0) < 0,
            },
          ],
        },
      ]}
      columns={(inView, query) => {
        const label = nameLabels(inView, query)
        return [
          {
            accessor: 'displayName',
            title: 'Player',
            sortable: true,
            render: (r) => label(r),
          },
          {
            group: 'box',
            title: 'Box',
            columns: [
              { accessor: 'box', title: '#', sortable: true, numeric: true },
              {
                accessor: 'boxSize',
                title: 'Players',
                shortTitle: 'P',
                visibleMediaQuery: WIDE,
                sortable: true,
                numeric: true,
              },
            ],
          },
          {
            group: 'place',
            title: 'Place in box',
            visibleMediaQuery: WIDE,
            columns: [
              {
                accessor: 'boxStart',
                title: 'Start',
                shortTitle: 'S',
                defaultHidden: true,
                sortable: true,
                numeric: true,
              },
              {
                accessor: 'boxFinish',
                title: 'Finish',
                shortTitle: 'F',
                sortable: true,
                numeric: true,
              },
            ],
          },
          {
            group: 'ranking',
            title: 'Ranking',
            columns: [
              {
                accessor: 'rankBefore',
                title: 'Before',
                shortTitle: 'B',
                sortable: true,
                numeric: true,
                render: (r) =>
                  r.rankBefore === null ? <NoValue /> : `#${r.rankBefore}`,
              },
              {
                accessor: 'rankAfter',
                title: 'After',
                shortTitle: 'A',
                sortable: true,
                numeric: true,
                render: (r) =>
                  r.rankAfter === null ? <NoValue /> : `#${r.rankAfter}`,
              },
              {
                accessor: 'rankChange',
                title: 'Change',
                shortTitle: '+/−',
                sortable: true,
                sortDescFirst: true,
                numeric: true,
                render: (r) => <Delta value={r.rankChange} />,
              },
            ],
          },
          wonLostGroup('matches', 'Matches', {
            total: 'matches',
            won: 'matchesWon',
            lost: 'matchesLost',
            diff: 'matchDiff',
            pct: 'matchWinPct',
          }),
          wonLostGroup('games', 'Games', {
            total: 'sets',
            won: 'setsWon',
            lost: 'setsLost',
            diff: 'gameDiff',
            pct: 'setWinPct',
          }),
          {
            group: 'points',
            title: 'Points',
            defaultHidden: true,
            columns: [
              { accessor: 'pointsFor', title: 'For', shortTitle: 'F', ...NUM },
              {
                accessor: 'pointsAgainst',
                title: 'Against',
                shortTitle: 'A',
                ...NUM,
              },
              {
                accessor: 'pointsDiff',
                title: 'Diff',
                shortTitle: '+/−',
                ...NUM,
                render: (r) => <Delta value={r.pointsDiff} />,
              },
            ],
          },
        ]
      }}
    />
  )
}

const NUM = { sortable: true, sortDescFirst: true, numeric: true }

type NumberField = {
  [K in keyof Row]: Row[K] extends number ? K : never
}[keyof Row]
type ShareField = {
  [K in keyof Row]: Row[K] extends number | null ? K : never
}[keyof Row]

/** Total / Won / Lost / Diff / Win% (the lab's), all in Columns. */
function wonLostGroup(
  group: string,
  title: string,
  f: {
    total: NumberField
    won: NumberField
    lost: NumberField
    diff: NumberField
    pct: ShareField
  },
): ListColumnGroup<Row> {
  return {
    group,
    title,
    defaultHidden: true,
    columns: [
      { accessor: f.total, title: 'Total', shortTitle: 'T', ...NUM },
      {
        accessor: f.won,
        title: 'Won',
        shortTitle: 'W',
        ...NUM,
        render: (r) => <Count value={r[f.won]} kind="win" />,
      },
      {
        accessor: f.lost,
        title: 'Lost',
        shortTitle: 'L',
        ...NUM,
        render: (r) => <Count value={r[f.lost]} kind="loss" />,
      },
      {
        accessor: f.diff,
        title: 'Diff',
        shortTitle: '+/−',
        ...NUM,
        render: (r) => <Delta value={r[f.diff]} />,
      },
      {
        accessor: f.pct,
        title: 'Win%',
        shortTitle: '%',
        ...NUM,
        render: (r) => <Percent value={r[f.pct]} />,
      },
    ],
  }
}
