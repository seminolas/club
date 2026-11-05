// Check-in (club-table-lab AttendanceDemo; old UI: the Attendance tab). While
// check-in is open, any signed-in player marks themselves or anyone else as
// attending (V2), with Undo; a card at the top does it for yourself. Admins
// also add someone new ("Add “…”"). Typing a few letters and Enter marks the
// first match. Under each player's button (or "Attending ✓"), their latest
// check-in change ("by Ray · 6:30pm"); tap it for the night's history.
import {
  Anchor,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Popover,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { IconHistory } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
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

// TRIAL (remove before merging), picked on the page's URL:
// ?cue=underline|icon|count|none: how a note with history shows it;
// ?layout=switch: an Attending switch and a "Marked by" column instead of
// the button and its note; ?layout=switch2: the same, Marked by after
// Attending.
type Cue = 'underline' | 'icon' | 'count' | 'none'
const CUES: Cue[] = ['underline', 'icon', 'count', 'none']
type Layout = 'button' | 'switch' | 'switch2'
function useTrial(): { cue: Cue; layout: Layout } {
  const [trial, setTrial] = useState<{ cue: Cue; layout: Layout }>({
    cue: 'underline',
    layout: 'button',
  })
  // After mounting, so the server's and the browser's first render match.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const cue = q.get('cue') as Cue | null
    setTrial({
      cue: cue && CUES.includes(cue) ? cue : 'underline',
      layout:
        q.get('layout') === 'switch'
          ? 'switch'
          : q.get('layout') === 'switch2'
            ? 'switch2'
            : 'button',
    })
  }, [])
  return trial
}

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
  const myRow = me ? rows.find((r) => r.personId === me.id) : undefined
  // Who made a change, by their short name (as in boxes: "Sam N." on a clash).
  const markerName = (by: CheckIn['by']) => {
    if (!by) return 'an admin'
    const p = details.get(by.id)
    return boxName(
      { name: by.name, preferredName: p?.preferredName },
      props.ladder,
    )
  }

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

  const { cue, layout } = useTrial()
  const switches = layout !== 'button'
  // switch2: the switch is a column of its own, so Marked by can follow it.
  const ownColumn = layout === 'switch2'
  const attendingSwitch = (r: Row) => (
    <Switch
      checked={r.coming}
      onChange={() => void toggle(r)}
      onClick={(e) => e.stopPropagation()}
      size="md"
      disabled={!props.canMark}
      aria-label={`${r.fullName} attending`}
      styles={{ body: { justifyContent: 'center' } }}
    />
  )
  const note = (r: Row) =>
    r.history.length > 0 ? (
      <CheckInNote history={r.history} name={markerName} cue={cue} />
    ) : undefined

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
        primaryActionHidden={ownColumn}
        // The marked row stays in view (its switch flips, Marked by updates);
        // the next name typed replaces the search.
        keepSearchAfterAction
        initialSort={{ column: 'rank', direction: 'asc' }}
        header={props.header}
        // The primary action toggles; Enter and a tap do the same.
        primaryActionTitle="Attending"
        primaryAction={
          props.canMark && switches
            ? (r) => ({
                label: r.coming ? 'Attending' : 'Mark attending',
                run: () => void toggle(r),
                control: attendingSwitch(r),
              })
            : props.canMark
              ? (r) =>
                  r.coming
                    ? {
                        label: 'Attending ✓',
                        widestLabel: 'Mark attending',
                        done: true,
                        run: () => void toggle(r),
                        note: note(r),
                      }
                    : {
                        label: 'Mark attending',
                        widestLabel: 'Mark attending',
                        run: () => void toggle(r),
                        note: note(r),
                      }
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
            ...(ownColumn
              ? [
                  {
                    accessor: 'coming' as const,
                    title: 'Attending',
                    toggleable: false,
                    textAlign: 'center' as const,
                    render: (r: Row) =>
                      props.canMark ? (
                        attendingSwitch(r)
                      ) : r.coming ? (
                        <Text size="sm" fw={600} c="teal">
                          Attending ✓
                        </Text>
                      ) : null,
                  },
                ]
              : []),
            ...(switches
              ? [
                  {
                    accessor: 'history' as const,
                    title: 'Marked by',
                    toggleable: false,
                    render: (r: Row) =>
                      r.history.length > 0 ? (
                        <MarkedBy history={r.history} name={markerName} />
                      ) : null,
                  },
                ]
              : []),
            // Without the Mark attending button, who's attending is a column.
            ...(props.canMark || ownColumn
              ? []
              : [
                  {
                    accessor: 'coming',
                    title: 'Attending',
                    toggleable: false,
                    render: (r: Row) => (
                      <Stack gap={2} align="flex-end">
                        {r.coming && (
                          <Text size="sm" fw={600} c="teal">
                            Attending ✓
                          </Text>
                        )}
                        {!switches && note(r)}
                      </Stack>
                    ),
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

/**
 * A player's latest check-in change: "by Ray · 6:30pm", or "unmarked by Ray
 * · 6:45pm". With more than one change tonight it's underlined, and a tap
 * shows them all, newest first.
 */
function CheckInNote(props: {
  history: CheckIn[]
  name: (by: CheckIn['by']) => string
  cue: Cue
}) {
  const { history, name, cue } = props
  const line = (c: CheckIn, first: boolean) =>
    `${c.attending ? (first ? 'Marked by' : 'by') : first ? 'Unmarked by' : 'unmarked by'} ${name(c.by)} · ${markedTime(c.at)}`
  const latest = history[history.length - 1]
  const text = (
    <Text size="xs" c="dimmed" span>
      {line(latest, false)}
    </Text>
  )
  if (history.length < 2) return text
  const target =
    cue === 'icon' ? (
      <>
        {text}{' '}
        <IconHistory
          size={12}
          color="var(--mantine-color-dimmed)"
          style={{ verticalAlign: '-2px' }}
        />
      </>
    ) : cue === 'count' ? (
      <Text size="xs" c="dimmed" span>
        {line(latest, false)} ({history.length})
      </Text>
    ) : (
      text
    )
  return (
    <Popover position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <UnstyledButton
          // Not the row's own tap (that marks or unmarks).
          onClick={(e) => e.stopPropagation()}
          aria-label={`Check-in history: ${history.length} changes`}
          style={
            cue === 'underline'
              ? { textDecoration: 'underline dotted', textUnderlineOffset: 3 }
              : undefined
          }
        >
          {target}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={4}>
          {[...history].reverse().map((c) => (
            <Text key={c.id} size="xs">
              {line(c, true)}
            </Text>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** TRIAL (layout=switch): who made the latest change; a tap shows them all. */
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

/** "Are you playing tonight?" for the signed-in player (V2). */
function YouCard(props: { row: Row; onToggle: () => void }) {
  const { row } = props
  return (
    <Paper withBorder p="md" radius="md" mb="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600}>
          {row.coming ? 'You’re attending ✓' : 'Are you playing tonight?'}
        </Text>
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
