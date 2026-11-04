// Check-in (club-table-lab AttendanceDemo; old UI: the Attendance tab). While
// check-in is open, any signed-in player marks themselves or anyone else as
// attending (V2), with Undo; a card at the top does it for yourself. Admins
// also add someone new ("Add “…”"). Typing a few letters and Enter marks the
// first match. Each attendee shows who marked them, unless they did it
// themselves. Everyone else, and every later state, sees who's attending.
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LadderRow } from '../../../services/ladder'
import type { Player } from '../../../types'
import { addPlayerFn, setAttendanceFn } from '../../fns/session'
import { INFO_TEXT } from '../../lib/colors'
import { cleanName, shortName } from '../../lib/names'
import { withAttendance } from '../../lib/session'
import type { Session } from '../../lib/session'
import { toastError, toastOk, toastWithUndo } from '../../lib/toasts'
import { ListTable } from '../list-table/ListTable'
import {
  Dash,
  SIX_MONTHS,
  helloClubFilter,
  lastPlayedFilter,
  markedTime,
  playedDate,
} from '../list-helpers'
import type { PersonRow } from '../list-helpers'

/** Wider than a phone: "Marked by" is a column; on phones, a line. */
const WIDE = '(min-width: 36em)'

interface Row extends PersonRow {
  rank: number
  coming: boolean
  /** Who marked them attending, if someone else did. */
  markedBy: string | null
  markedAt: string | null
}

/** Now, as the check-in audit writes times (UTC, "YYYY-MM-DD HH:MM:SS"). */
const auditNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

export function CheckInStep(props: {
  session: Session
  ladder: LadderRow[]
  /** Signed-in players and admins, while check-in is open. */
  canMark: boolean
  /** Admins, while check-in is open: adding someone new. */
  canAdd: boolean
  /** The viewer's own player, if signed in. */
  me: Player | null
  header: ReactNode
  stickyTop: number
}) {
  const { session, me } = props
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<string | null>(null)
  const key = ['session', session.date]

  // The list: today's ladder while check-in is open, else the ladder the
  // session started with (as the old UI).
  const details = new Map(props.ladder.map((p) => [p.id, p]))
  const base =
    session.status === 'attendance'
      ? props.ladder.map((p) => ({ id: p.id, name: p.name }))
      : session.leaderboardBefore
  const coming = new Set(session.attendees.map((p) => p.id))
  const marks = new Map(session.marks.map((m) => [m.playerId, m]))
  const rows: Row[] = base.map((p, i) => {
    const d = details.get(p.id)
    const mark = coming.has(p.id) ? marks.get(p.id) : undefined
    const byOther = mark?.by && mark.by.id !== p.id ? mark.by : null
    return {
      personId: p.id,
      fullName: cleanName(p.name),
      preferredName: d?.preferredName ?? null,
      lastPlayed: d?.lastPlayed ?? null,
      helloClub: Boolean(d?.hcMemberId),
      rank: i + 1,
      coming: coming.has(p.id),
      markedBy: byOther ? cleanName(byOther.name) : null,
      markedAt: byOther ? (mark?.at ?? null) : null,
    }
  })
  const myRow = me ? rows.find((r) => r.personId === me.id) : undefined

  // Marks straight away; puts it back if the server refuses.
  const setComing = async (r: Row, attending: boolean) => {
    const was =
      queryClient
        .getQueryData<Session>(key)
        ?.marks.find((m) => m.playerId === r.personId) ?? null
    const player = { id: r.personId, name: r.fullName }
    const apply = (on: boolean, mark: Session['marks'][number] | null) =>
      queryClient.setQueryData<Session>(
        key,
        (s) => s && withAttendance(s, { player, attending: on, mark }),
      )
    apply(attending, { playerId: r.personId, by: me, at: auditNow() })
    try {
      await setAttendanceFn({
        data: { date: session.date, playerId: r.personId, attending },
      })
    } catch (e) {
      apply(!attending, was)
      toastError(e)
      return false
    }
    return true
  }
  const toggle = async (r: Row) => {
    const attending = !r.coming
    if (!(await setComing(r, attending))) return
    const you = r.personId === me?.id
    const message = attending
      ? you
        ? 'You’re marked attending'
        : `${r.fullName} marked attending`
      : you
        ? 'You’re no longer attending'
        : `${r.fullName} is no longer attending`
    toastWithUndo(
      message,
      () => void setComing({ ...r, coming: attending }, !attending),
    )
  }

  return (
    <>
      <ListTable<Row>
        records={rows}
        getKey={(r) => r.personId}
        noun={{ one: 'player', many: 'players' }}
        searchText={(r) => `${r.fullName} ${r.preferredName ?? ''}`}
        searchPlaceholder="Find a player…"
        intro={
          props.canMark && myRow ? (
            <YouCard row={myRow} onToggle={() => void toggle(myRow)} />
          ) : undefined
        }
        filters={[
          {
            kind: 'options',
            id: 'coming',
            label: 'Attending',
            column: 'coming',
            options: [
              {
                value: 'yes',
                label: 'Attending',
                pill: 'Attending',
                test: (r) => r.coming,
              },
              {
                value: 'no',
                label: 'Not attending',
                pill: 'Not attending',
                test: (r) => !r.coming,
              },
            ],
          },
          lastPlayedFilter,
          helloClubFilter,
        ]}
        defaultFilters={{ played: SIX_MONTHS }}
        stickyHeader
        stickyTop={props.stickyTop}
        primaryColumn="fullName"
        initialSort={{ column: 'rank', direction: 'asc' }}
        header={props.header}
        // The primary action toggles; Enter and a tap do the same.
        primaryActionTitle="Attending"
        primaryAction={
          props.canMark
            ? (r) =>
                r.coming
                  ? {
                      label: 'Attending ✓',
                      done: true,
                      run: () => void toggle(r),
                    }
                  : { label: 'Mark attending', run: () => void toggle(r) }
            : undefined
        }
        addNew={
          props.canAdd
            ? {
                label: (q) => `Add “${q}” as a new player`,
                onAdd: (q) => setAdding(q),
              }
            : undefined
        }
        columns={() => {
          return [
            {
              accessor: 'rank',
              title: '#',
              numeric: true,
              sortable: true,
            },
            {
              accessor: 'fullName',
              title: 'Player',
              // Phones: who marked them, on a line under the name.
              render: (r) => (
                <>
                  {r.fullName}
                  {r.markedBy && (
                    <Text size="xs" c="dimmed" hiddenFrom="xs">
                      <MarkedBy row={r} />
                    </Text>
                  )}
                </>
              ),
            },
            {
              accessor: 'markedBy',
              title: 'Marked by',
              visibleMediaQuery: WIDE,
              render: (r) =>
                r.markedBy ? (
                  <Text size="sm" c="dimmed" span>
                    <MarkedBy row={r} />
                  </Text>
                ) : null,
            },
            {
              accessor: 'lastPlayed',
              title: 'Last played',
              sortable: true,
              sortDescFirst: true,
              visibleMediaQuery: WIDE,
              render: (r) => playedDate(r.lastPlayed),
            },
            {
              accessor: 'helloClub',
              title: 'HelloClub',
              visibleMediaQuery: WIDE,
              render: (r) => (r.helloClub ? 'Linked' : <Dash />),
            },
            // Without the Mark attending button, who's attending is a column.
            ...(props.canMark
              ? []
              : [
                  {
                    accessor: 'coming',
                    title: 'Attending',
                    toggleable: false,
                    render: (r: Row) =>
                      r.coming ? (
                        <Text size="sm" fw={600} c="teal">
                          Attending ✓
                        </Text>
                      ) : null,
                  },
                ]),
          ]
        }}
      />
      <AddPlayerModal
        name={adding}
        ladderLength={props.ladder.length}
        onClose={() => setAdding(null)}
        onAdd={async (input) => {
          try {
            await addPlayerFn({ data: { date: session.date, ...input } })
            await queryClient.invalidateQueries()
            toastOk(`Added ${input.name} at position ${input.insertRank}.`)
            setAdding(null)
          } catch (e) {
            toastError(e)
          }
        }}
      />
    </>
  )
}

/** "by Ray Lugsanay · 7:42pm" */
function MarkedBy(props: { row: Row }) {
  const { markedBy, markedAt } = props.row
  return (
    <>
      by {markedBy}
      {markedAt && ` · ${markedTime(markedAt)}`}
    </>
  )
}

/** "Are you playing tonight?" for the signed-in player (V2). */
function YouCard(props: { row: Row; onToggle: () => void }) {
  const { row } = props
  return (
    <Paper withBorder p="md" radius="md" mb="sm">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fw={600}>
            {row.coming ? 'You’re attending ✓' : 'Are you playing tonight?'}
          </Text>
          {row.markedBy && (
            <Text size="xs" c="dimmed">
              Marked by {row.markedBy}
            </Text>
          )}
        </div>
        {row.coming ? (
          <Button variant="default" onClick={props.onToggle}>
            Undo
          </Button>
        ) : (
          <Button onClick={props.onToggle}>I’m playing</Button>
        )}
      </Group>
    </Paper>
  )
}

/** A new player: name, display name, ladder position (default: the bottom). */
function AddPlayerModal(props: {
  name: string | null
  ladderLength: number
  onClose: () => void
  onAdd: (input: {
    name: string
    preferredName: string | null
    insertRank: number
  }) => Promise<void>
}) {
  return (
    <Modal
      opened={props.name !== null}
      onClose={props.onClose}
      title="Add a new player"
      size="sm"
      centered
    >
      {props.name !== null && <AddPlayerForm {...props} name={props.name} />}
    </Modal>
  )
}

function AddPlayerForm(props: {
  name: string
  ladderLength: number
  onClose: () => void
  onAdd: (input: {
    name: string
    preferredName: string | null
    insertRank: number
  }) => Promise<void>
}) {
  const [full, setFull] = useState(titleCase(props.name.trim()))
  const [display, setDisplay] = useState(shortName(full))
  const bottom = props.ladderLength + 1
  const [position, setPosition] = useState<number | string>(bottom)
  const [busy, setBusy] = useState(false)
  const name = full.trim()
  return (
    <Stack>
      <Text size="sm" c={INFO_TEXT}>
        They’re added to the ladder and marked as attending.
      </Text>
      <TextInput
        label="Full name"
        value={full}
        onChange={(e) => setFull(e.currentTarget.value)}
        data-autofocus
      />
      <TextInput
        label="Display name"
        description="The short name used in boxes"
        value={display}
        onChange={(e) => setDisplay(e.currentTarget.value)}
      />
      <NumberInput
        label="Ladder position"
        description={`1 to ${bottom} (${bottom} is the bottom)`}
        min={1}
        max={bottom}
        value={position}
        onChange={setPosition}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          disabled={!name}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            const pos = Math.max(
              1,
              Math.min(Math.round(Number(position)) || bottom, bottom),
            )
            const preferred = display.trim()
            await props.onAdd({
              name,
              // Only a display name that isn't the default one is stored.
              preferredName:
                preferred && preferred !== shortName(name) ? preferred : null,
              insertRank: pos,
            })
            setBusy(false)
          }}
        >
          Add and mark attending
        </Button>
      </Group>
    </Stack>
  )
}

function titleCase(s: string) {
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}
