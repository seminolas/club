// The Boxes step (club-table-lab GamesDemo; old UI: the Games tab): one row
// per box, closed at first. Search finds a player's box; Enter (or Expand)
// opens it with the cursor in its first empty score. Expand all sits next to
// Filters. Who can type: admins any box, a signed-in player their own box,
// nobody once closed (the live channel checks the same on the server).
import { Text } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { matchesSearch } from '../list-table/filters'
import { ListTable, MOTION_MS } from '../list-table/ListTable'
import { matchStatus } from '../../lib/session'
import type { Session, SessionBox } from '../../lib/session'
import { BoxDetail } from './BoxDetail'

type BoxStatus = 'finished' | 'check' | 'playing' | 'not_started'

interface BoxRow {
  box: number
  index: number
  data: SessionBox
  players: string
  done: number
  total: number
  status: BoxStatus
  /** One search text per player: a box matches when one player does. */
  names: string[]
}

function rowOf(box: SessionBox, index: number): BoxRow {
  const statuses = box.matches.map(matchStatus)
  const done = statuses.filter((s) => s === 'complete').length
  const status: BoxStatus = statuses.includes('invalid')
    ? 'check'
    : done === statuses.length
      ? 'finished'
      : statuses.some((s) => s !== 'not_started')
        ? 'playing'
        : 'not_started'
  return {
    box: index + 1,
    index,
    data: box,
    players: box.players.map((p) => p.name).join(', '),
    done,
    total: statuses.length,
    status,
    names: box.players.map((p) => p.name),
  }
}

const STATUS_TEXT: Record<BoxStatus, { text: string; c?: string }> = {
  finished: { text: 'Finished ✓', c: 'var(--mantine-color-teal-text)' },
  check: { text: 'Check scores', c: 'var(--mantine-color-red-text)' },
  playing: { text: 'In progress', c: 'var(--club-info-text)' },
  not_started: { text: 'Not started', c: 'var(--club-info-text)' },
}

// Focus the first empty score once the box's panel has finished opening.
// Focusing earlier, while the panel is still sliding open, makes the browser
// scroll the clipped panel to show the field (lab, "Opening a box").
function focusFirstEmpty(detailId: string, frames = 60) {
  requestAnimationFrame(() => {
    const panel = document.getElementById(detailId)
    const sliding = panel?.firstElementChild as HTMLElement | null | undefined
    // Open = visible, and Mantine has dropped the inline height it animates
    // (while closed, both heights are 0, which would look "finished").
    const open =
      sliding !== null &&
      sliding !== undefined &&
      sliding.getBoundingClientRect().height > 0 &&
      sliding.style.height === ''
    if (!open) {
      if (frames > 0) focusFirstEmpty(detailId, frames - 1)
      return
    }
    const field =
      panel?.querySelector<HTMLInputElement>(
        '[data-score][data-empty]:not([readonly])',
      ) ??
      panel?.querySelector<HTMLInputElement>('[data-score]:not([readonly])')
    field?.focus({ preventScroll: true })
    sliding.scrollTop = 0
    // Scroll only if the field itself is hidden: below the screen, or under
    // the sticky search bar. One small movement, not a jump to the box's top.
    if (!field) return
    const r = field.getBoundingClientRect()
    const toolbar = panel?.closest('.lt-root')?.querySelector('.lt-toolbar')
    const covered = toolbar ? toolbar.getBoundingClientRect().bottom : 0
    if (r.bottom > window.innerHeight - 16 || r.top < covered + 8)
      field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

export function BoxesStep(props: {
  session: Session
  /** Display name per player id (the score sheets' rule). */
  label: (id: number) => string
  canEdit: (boxIndex: number) => boolean
  onScore: (
    box: number,
    match: number,
    game: number,
    side: 0 | 1,
    value: number | null,
  ) => void
  header: ReactNode
  stickyTop: number
}) {
  const rows = props.session.boxes.map(rowOf)
  const ladderBefore = props.session.leaderboardBefore.map((p) => p.id)

  return (
    <ListTable<BoxRow>
      records={rows}
      getKey={(r) => r.box}
      noun={{ one: 'box', many: 'boxes' }}
      searchText={(r) => r.names}
      searchPlaceholder="Find a player’s box…"
      stickyHeader
      stickyTop={props.stickyTop}
      hideColumnChooser
      primaryColumn="players"
      initialSort={{ column: 'box', direction: 'asc' }}
      header={props.header}
      filters={[
        {
          kind: 'options',
          id: 'status',
          label: 'Status',
          options: [
            {
              value: 'open',
              label: 'Not finished',
              pill: 'Not finished',
              test: (r) => r.status !== 'finished',
            },
            {
              value: 'finished',
              label: 'Finished',
              pill: 'Finished',
              test: (r) => r.status === 'finished',
            },
            {
              value: 'check',
              label: 'Check scores',
              pill: 'Check scores',
              test: (r) => r.status === 'check',
            },
          ],
        },
      ]}
      // Stay on the player's box after opening it.
      keepSearchAfterAction
      primaryActionTitle=""
      // The button is the row's only control, and toggles.
      primaryAction={(r, row) => ({
        label: row.expanded ? 'Collapse' : 'Expand',
        // One chevron that turns, in step with the panel sliding.
        icon: (
          <IconChevronDown
            size={16}
            style={{
              transform: row.expanded ? 'rotate(180deg)' : undefined,
              transition: `transform ${MOTION_MS}ms ease`,
            }}
          />
        ),
        expanded: row.expanded,
        keepFocus: !row.expanded,
        run: () => {
          if (row.expanded) return row.collapse()
          row.expand()
          focusFirstEmpty(row.detailId)
        },
      })}
      detail={(r) => (
        <BoxDetail
          box={r.data}
          label={props.label}
          ladderBefore={ladderBefore}
          editable={props.canEdit(r.index)}
          onScore={(mi, gi, side, value) =>
            props.onScore(r.index, mi, gi, side, value)
          }
        />
      )}
      columns={(_inView, query) => {
        // While searching, the player(s) who matched show in bold, with the
        // full name; the rest stay short.
        const hit = (name: string) =>
          query.trim() !== '' && matchesSearch(name, query)
        return [
          {
            accessor: 'box',
            title: 'Box',
            sortable: true,
            numeric: true,
          },
          {
            accessor: 'players',
            title: 'Players',
            toggleable: false,
            render: (r) => (
              <Text size="sm" fw="inherit">
                {r.data.players.map((p, i) => (
                  <Fragment key={p.id}>
                    {i > 0 && ', '}
                    {hit(p.name) ? (
                      <strong>{p.name}</strong>
                    ) : (
                      props.label(p.id)
                    )}
                  </Fragment>
                ))}
              </Text>
            ),
          },
          {
            accessor: 'done',
            title: 'Matches',
            sortable: true,
            numeric: true,
            render: (r) => `${r.done}/${r.total}`,
          },
          {
            accessor: 'status',
            title: 'Status',
            sortable: true,
            visibleMediaQuery: '(min-width: 36em)',
            render: (r) => (
              <Text size="sm" fw="inherit" c={STATUS_TEXT[r.status].c}>
                {STATUS_TEXT[r.status].text}
              </Text>
            ),
          },
        ]
      }}
    />
  )
}
