// Check-in (club-table-lab AttendanceDemo; old UI: the Attendance tab). Admins
// mark people coming while check-in is open: type a few letters, Enter marks
// the first match, with Undo. Everyone else, and every later state, sees who's
// coming. "Add “…”" adds someone new (admins, check-in open).
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LadderRow } from '../../../services/ladder'
import { addPlayerFn, setAttendanceFn } from '../../fns/session'
import { INFO_TEXT } from '../../lib/colors'
import { shortName } from '../../lib/names'
import type { Session } from '../../lib/session'
import { toastError, toastOk, toastWithUndo } from '../../lib/toasts'
import { ListTable } from '../list-table/ListTable'
import {
  Dash,
  SIX_MONTHS,
  helloClubFilter,
  lastPlayedFilter,
  nameLabels,
  playedDate,
} from '../list-helpers'
import type { PersonRow } from '../list-helpers'

interface Row extends PersonRow {
  rank: number
  coming: boolean
}

export function CheckInStep(props: {
  session: Session
  ladder: LadderRow[]
  /** Admins while check-in is open. */
  canMark: boolean
  header: ReactNode
  stickyTop: number
}) {
  const { session } = props
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
  const rows: Row[] = base.map((p, i) => {
    const d = details.get(p.id)
    return {
      personId: p.id,
      fullName: p.name,
      displayName: shortName(p.name, d?.preferredName),
      lastPlayed: d?.lastPlayed ?? null,
      helloClub: Boolean(d?.hcMemberId),
      rank: i + 1,
      coming: coming.has(p.id),
    }
  })

  // Marks straight away; puts it back if the server refuses.
  const setComing = async (r: Row, attending: boolean) => {
    const patch = (on: boolean) =>
      queryClient.setQueryData<Session>(
        key,
        (s) =>
          s && {
            ...s,
            attendees: on
              ? [...s.attendees, { id: r.personId, name: r.fullName }]
              : s.attendees.filter((a) => a.id !== r.personId),
          },
      )
    patch(attending)
    try {
      await setAttendanceFn({
        data: { date: session.date, playerId: r.personId, attending },
      })
    } catch (e) {
      patch(!attending)
      toastError(e)
      return false
    }
    return true
  }
  const toggle = async (r: Row) => {
    const attending = !r.coming
    if (!(await setComing(r, attending))) return
    toastWithUndo(
      attending
        ? `${r.fullName} marked attending`
        : `${r.fullName} is no longer attending`,
      () => void setComing({ ...r, coming: attending }, !attending),
    )
  }

  return (
    <>
      <ListTable<Row>
        records={rows}
        getKey={(r) => r.personId}
        noun={{ one: 'player', many: 'players' }}
        searchText={(r) => `${r.fullName} ${r.displayName}`}
        searchPlaceholder="Find a player…"
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
        primaryColumn="displayName"
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
          props.canMark
            ? {
                label: (q) => `Add “${q}” as a new player`,
                onAdd: (q) => setAdding(q),
              }
            : undefined
        }
        columns={(inView, query) => {
          const label = nameLabels(inView, query)
          return [
            {
              accessor: 'rank',
              title: '#',
              numeric: true,
              sortable: true,
            },
            {
              accessor: 'displayName',
              title: 'Player',
              render: (r) => label(r),
            },
            {
              accessor: 'lastPlayed',
              title: 'Last played',
              sortable: true,
              sortDescFirst: true,
              visibleMediaQuery: '(min-width: 36em)',
              render: (r) => playedDate(r.lastPlayed),
            },
            {
              accessor: 'helloClub',
              title: 'HelloClub',
              visibleMediaQuery: '(min-width: 36em)',
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
