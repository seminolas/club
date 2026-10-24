// The Results step: tonight's ladder movement, one row per player who played
// (old UI: Wrap-up's "Post-game ranking"; the lab's Stats table, of which only
// the ladder-movement part is ported, as decided). The whole ladder stays on
// the Players tab.
import type { ReactNode } from 'react'
import { Delta, NoValue } from '../list-table/cells'
import { ListTable } from '../list-table/ListTable'
import { nameLabels } from '../list-helpers'
import { shortName } from '../../lib/names'
import type { Session } from '../../lib/session'

interface Row {
  personId: number
  displayName: string
  fullName: string
  box: number | null
  rankBefore: number | null
  rankAfter: number | null
  /** Places moved up (positive) or down (negative); null if new tonight. */
  rankChange: number | null
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
  const boxOf = new Map(
    session.boxes.flatMap((b, bi) => b.players.map((p) => [p.id, bi + 1])),
  )
  const rows: Row[] = session.attendees.map((p) => {
    const b = before.get(p.id) ?? null
    const a = after.get(p.id) ?? null
    return {
      personId: p.id,
      fullName: p.name,
      displayName: shortName(p.name, props.preferred.get(p.id)),
      box: boxOf.get(p.id) ?? null,
      rankBefore: b,
      rankAfter: a,
      rankChange: b !== null && a !== null ? b - a : null,
    }
  })

  return (
    <ListTable<Row>
      records={rows}
      getKey={(r) => r.personId}
      noun={{ one: 'player', many: 'players' }}
      searchText={(r) => `${r.fullName} ${r.displayName}`}
      searchPlaceholder="Find a player…"
      stickyHeader
      stickyTop={props.stickyTop}
      hideColumnChooser
      header={props.header}
      primaryColumn="displayName"
      initialSort={{ column: 'rankAfter', direction: 'asc' }}
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
            accessor: 'box',
            title: 'Box',
            sortable: true,
            numeric: true,
            render: (r) => r.box ?? <NoValue />,
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
        ]
      }}
    />
  )
}
