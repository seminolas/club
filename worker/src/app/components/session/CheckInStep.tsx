// Check-in (club-table-lab AttendanceDemo; old UI: the Attendance tab). While
// check-in is open, any signed-in player marks themselves or anyone else as
// attending (V2) with an Attending switch, with Undo. Admins also add someone
// new ("Add “…”"). Typing a few letters and Enter toggles the first match.
// "Marked by", next to it: who made the latest change; tap it for the night's
// history.
import {
  Anchor,
  Button,
  Group,
  Modal,
  NumberInput,
  Popover,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LadderRow } from '../../../services/ladder'
import type { CheckIn, Player } from '../../../types'
import { addPlayerFn, setAttendanceFn } from '../../fns/session'
import { INFO_TEXT } from '../../lib/colors'
import { boxName, cleanName, shortName } from '../../lib/names'
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

const WIDE = '(min-width: 36em)'

interface Row extends PersonRow {
  rank: number
  coming: boolean
  /** This player's check-in changes tonight, oldest first. */
  history: CheckIn[]
}

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
  const history = new Map<number, CheckIn[]>()
  for (const c of session.checkIns)
    history.set(c.playerId, [...(history.get(c.playerId) ?? []), c])
  const rows: Row[] = base.map((p, i) => {
    const d = details.get(p.id)
    return {
      personId: p.id,
      fullName: cleanName(p.name),
      preferredName: d?.preferredName ?? null,
      lastPlayed: d?.lastPlayed ?? null,
      helloClub: Boolean(d?.hcMemberId),
      rank: i + 1,
      coming: coming.has(p.id),
      history: history.get(p.id) ?? [],
    }
  })
  // Who made a change, by their short name (as in boxes: "Sam N." on a clash).
  const markerName = (by: CheckIn['by']) => {
    if (!by) return 'an admin'
    const p = details.get(by.id)
    return boxName(
      { name: by.name, preferredName: p?.preferredName },
      props.ladder,
    )
  }

  // "Marked by" filter: whoever the Marked by column shows (the latest
  // change's marker). Me first, then everyone else who marked someone.
  const markerKey = (by: CheckIn['by']) => (by ? String(by.id) : 'admin')
  const latestKey = (r: Row) => {
    const latest = r.history.at(-1)
    return latest ? markerKey(latest.by) : null
  }
  const markers = new Map<string, CheckIn['by']>()
  for (const r of rows) {
    const latest = r.history.at(-1)
    if (latest) markers.set(markerKey(latest.by), latest.by)
  }
  if (me) markers.delete(String(me.id))
  const markedByOptions = [
    ...(me
      ? [
          {
            value: String(me.id),
            label: 'Me',
            pill: 'Marked by me',
            test: (r: Row) => latestKey(r) === String(me.id),
          },
        ]
      : []),
    ...[...markers]
      .map(([value, by]) => ({
        value,
        label: markerName(by),
        test: (r: Row) => latestKey(r) === value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]

  // Marks straight away, with a provisional "by me" note; the server's reply
  // replaces it with the saved change, or puts everything back if refused.
  const setComing = async (r: Row, attending: boolean) => {
    const player = { id: r.personId, name: r.fullName }
    const apply = (change: Parameters<typeof withAttendance>[1]) =>
      queryClient.setQueryData<Session>(
        key,
        (s) => s && withAttendance(s, change),
      )
    apply({
      player,
      attending,
      checkIn: {
        id: -Date.now(),
        playerId: r.personId,
        attending,
        by: me,
        at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      },
    })
    try {
      apply(
        await setAttendanceFn({
          data: { date: session.date, playerId: r.personId, attending },
        }),
      )
    } catch (e) {
      apply({ player, attending: !attending, checkIn: null })
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
          {
            kind: 'options',
            id: 'markedBy',
            label: 'Marked by',
            multiple: true,
            anyLabel: 'Anyone',
            onlyLabel: 'Only these',
            column: 'history',
            options: markedByOptions,
          },
          lastPlayedFilter,
          helloClubFilter,
        ]}
        defaultFilters={{ played: SIX_MONTHS }}
        stickyHeader
        stickyTop={props.stickyTop}
        primaryColumn="fullName"
        // Enter toggles the active row; its switch is the Attending column
        // (not the table's own action column), so Marked by can follow it.
        primaryActionHidden
        primaryAction={
          props.canMark
            ? (r) => ({
                label: r.coming ? 'Attending' : 'Mark attending',
                run: () => void toggle(r),
              })
            : undefined
        }
        // The marked row stays in view (its switch flips, Marked by updates);
        // the next name typed replaces the search.
        keepSearchAfterAction
        initialSort={{ column: 'rank', direction: 'asc' }}
        header={props.header}
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
            {
              accessor: 'coming',
              title: 'Attending',
              toggleable: false,
              textAlign: 'center',
              render: (r) =>
                props.canMark ? (
                  <Switch
                    checked={r.coming}
                    onChange={() => void toggle(r)}
                    // Not the row's own tap.
                    onClick={(e) => e.stopPropagation()}
                    size="md"
                    aria-label={`${r.fullName} attending`}
                    styles={{ body: { justifyContent: 'center' } }}
                  />
                ) : r.coming ? (
                  <Text size="sm" fw={600} c="teal">
                    Attending ✓
                  </Text>
                ) : null,
            },
            {
              accessor: 'history',
              title: 'Marked by',
              toggleable: false,
              render: (r) =>
                r.history.length > 0 ? (
                  <MarkedBy history={r.history} name={markerName} />
                ) : null,
            },
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

/**
 * Who made a player's latest check-in change; a tap shows every change
 * tonight, newest first ("Unmarked by Ray · 6:45pm").
 */
function MarkedBy(props: {
  history: CheckIn[]
  name: (by: CheckIn['by']) => string
}) {
  const { history, name } = props
  const latest = history[history.length - 1]
  return (
    <Popover position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Anchor
          component="button"
          size="sm"
          // Not the row's own tap.
          onClick={(e) => e.stopPropagation()}
          aria-label={`Check-in history: ${history.length} changes`}
        >
          {name(latest.by)}
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={4}>
          {[...history].reverse().map((c) => (
            <Text key={c.id} size="xs">
              {c.attending ? 'Marked' : 'Unmarked'} by {name(c.by)} ·{' '}
              {markedTime(c.at)}
            </Text>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
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
