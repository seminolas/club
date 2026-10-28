// The session card (club-table-lab AppDemo, "Session pages" in its
// DECISIONS.md): on one line the title and labelled pills (Date / Status /
// a count), the way forward at the top right (Assign boxes ›, Close ›) with
// "…" beside it (re-open, reassign, delete), the step's own word buttons,
// and a stepper (Check-in → Boxes → Results) that only navigates: steps the
// session hasn't reached are locked. Scrolled down, a compact copy stays
// pinned at the top.
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Stepper,
  Text,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconLock,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { INFO_TEXT } from '../../lib/colors'
import type { Phase } from '../../lib/session'
import { toastOk } from '../../lib/toasts'
import './SessionCard.css'

export type StepId = 'checkin' | 'boxes' | 'results'
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'checkin', label: 'Check-in' },
  { id: 'boxes', label: 'Boxes' },
  { id: 'results', label: 'Results' },
]
const PHASE_LABEL: Record<Phase, string> = {
  checkin: 'Check-in open',
  playing: 'Playing',
  closed: 'Closed',
}
/** Each state its own colour: blue to start, teal while playing, dark when done. */
const PHASE_COLOR: Record<Phase, string> = {
  checkin: 'blue',
  playing: 'teal',
  closed: 'dark',
}
/** What unlocks a locked step. */
const UNLOCKED_BY: Record<StepId, string> = {
  checkin: '',
  boxes: 'Assign boxes',
  results: 'Close',
}
/** Height of the pinned compact step bar, in px. */
export const PINNED_H = 56

/** The furthest step the session has reached. */
export function furthestStep(phase: Phase): StepId {
  return phase === 'checkin'
    ? 'checkin'
    : phase === 'playing'
      ? 'boxes'
      : 'results'
}

export interface MenuAction {
  label: string
  hint: string
  run: () => void
}

/** A plain step button ("Print score sheets"), or one with a choice. */
export interface StepAction {
  label: string
  run?: () => void
  /** A choice of how (e.g. Cards / Grid), shown as a menu. */
  items?: { label: string; run: () => void }[]
}

export interface SessionCardProps {
  title: string
  /** e.g. "Tue 20 Oct". */
  dateLabel: string
  phase: Phase
  step: StepId
  onStep: (step: StepId) => void
  /** [label, value] of the third pill. */
  count: [string, string]
  /** Under the step name in the pinned bar, e.g. "1 of 8 boxes finished". */
  status: string
  /** The way forward (admins), or nothing. */
  forward?: {
    label: string
    run: () => void
    /** Why it can't be done yet: looks disabled, and says so when tapped. */
    blocked?: string
  }
  /** "…": red, confirmed actions that undo work (admins). */
  menu: MenuAction[]
  /** The step's own plain buttons (in "…" on phones). */
  stepActions?: StepAction[]
  /** A line under the title, e.g. why check-in can't be changed. */
  note?: ReactNode
}

/** The card's content for each step, plus the pinned bar. */
export function useSessionCard(props: SessionCardProps) {
  const phone = !useMediaQuery('(min-width: 36em)', true)
  const furthest = STEPS.findIndex((s) => s.id === furthestStep(props.phase))
  const reachable = (id: StepId) =>
    STEPS.findIndex((x) => x.id === id) <= furthest
  const go = (id: StepId) => {
    if (reachable(id)) return props.onStep(id)
    // A locked step says what opens it.
    toastOk(
      `${STEPS.find((x) => x.id === id)?.label} opens after ${UNLOCKED_BY[id]}`,
    )
  }

  const forward = (size: 'sm' | 'xs' = 'sm') => {
    const f = props.forward
    if (!f) return null
    return (
      <Button
        size={size}
        rightSection={<IconChevronRight size={16} />}
        data-disabled={f.blocked ? true : undefined}
        onClick={() => (f.blocked ? toastOk(f.blocked) : f.run())}
        title={f.blocked}
      >
        {f.label}
      </Button>
    )
  }
  const steps = props.stepActions ?? []
  // Plain step buttons, right of the title (desktop).
  const stepButtons = steps.map((a) =>
    a.items ? (
      <Menu key={a.label} position="bottom-end">
        <Menu.Target>
          <Button
            variant="default"
            size="sm"
            rightSection={<IconChevronDown size={14} />}
          >
            {a.label}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {a.items.map((i) => (
            <Menu.Item key={i.label} onClick={i.run}>
              {i.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    ) : (
      <Button key={a.label} variant="default" size="sm" onClick={a.run}>
        {a.label}
      </Button>
    ),
  )
  // On phones the same actions as menu items ("Print score sheets: Cards").
  const stepItems = steps.flatMap((a) =>
    (a.items ?? [{ label: '', run: a.run ?? (() => {}) }]).map((i) => (
      <Menu.Item key={`${a.label}:${i.label}`} onClick={i.run}>
        {i.label ? `${a.label}: ${i.label}` : a.label}
      </Menu.Item>
    )),
  )
  // "…": what undoes work (red, confirmed) and, on phones, the step's plain
  // actions above it. The one icon-only button (developer); named for screen
  // readers.
  const showMenu = props.menu.length > 0 || (phone && stepItems.length > 0)
  const menu = showMenu ? (
    <Menu position="bottom-end" width={260}>
      <Menu.Target>
        <ActionIcon
          size={36}
          variant="default"
          aria-label="More session actions"
        >
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {phone && stepItems}
        {phone && stepItems.length > 0 && props.menu.length > 0 && (
          <Menu.Divider />
        )}
        {props.menu.map((m) => (
          <Menu.Item
            key={m.label}
            color="red"
            leftSection={<IconChevronLeft size={16} />}
            onClick={m.run}
          >
            <Text size="sm" fw={600} inherit>
              {m.label}
            </Text>
            <Text size="xs" c={INFO_TEXT}>
              {m.hint}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  ) : null

  const pill = (label: string, value: string, state = false) => (
    <Badge
      size="lg"
      tt="none"
      variant="light"
      color={state ? PHASE_COLOR[props.phase] : 'gray'}
      fw={state ? 700 : 600}
      className="app-pill"
      data-info={!state || undefined}
    >
      {phone ? (
        value
      ) : (
        <>
          <span className="app-pill-label">{label}:</span> {value}
        </>
      )}
    </Badge>
  )
  // Phones: no title, and pills without labels ("Tue 20 Oct", "Closed",
  // "38 players"), so they fit on one row with "…"; they wrap if they don't.
  const [countLabel, countValue] = props.count
  const titleLine = (
    <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
      {!phone && <Text fw={600}>{props.title}</Text>}
      <Group gap={6}>
        {pill('Date', props.dateLabel)}
        {pill('Status', PHASE_LABEL[props.phase], true)}
        {phone
          ? pill(countLabel, `${countValue} ${countLabel.toLowerCase()}`)
          : pill(countLabel, countValue)}
      </Group>
    </Group>
  )

  // The full card at the top; once it has scrolled away, a compact copy
  // stays pinned, the table's search bar right under it.
  const [card, setCard] = useState<HTMLElement | null>(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    if (!card) return
    const observer = new IntersectionObserver(
      ([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: `-${PINNED_H}px 0px 0px 0px` },
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [card])

  const content = (id: StepId) => (
    <Stack gap="sm" ref={id === props.step ? setCard : undefined}>
      {/* Title and pills left; actions right: plain buttons, "…", then the
          way forward (green). Phones: "…" stays on the title's row, the way
          forward gets a row of its own. */}
      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
        {titleLine}
        {(menu || (!phone && (props.forward || steps.length > 0))) && (
          <Group gap="xs" wrap="nowrap">
            {!phone && stepButtons}
            {menu}
            {!phone && forward()}
          </Group>
        )}
      </Group>
      {phone && props.forward && <Group justify="flex-end">{forward()}</Group>}
      {props.note}
      <Stepper
        // Progress is the furthest step reached, nothing beyond.
        active={props.phase === 'closed' ? 3 : furthest}
        onStepClick={(i) => go(STEPS[i].id)}
        size="sm"
        iconSize={32}
        allowNextStepsSelect={false}
        className="app-stepper"
      >
        {STEPS.map((x) => (
          <Stepper.Step
            key={x.id}
            label={x.label}
            // Locked steps stay tappable, to say what opens them; marked
            // unavailable for screen readers.
            allowStepSelect
            aria-disabled={!reachable(x.id) || undefined}
            data-locked={!reachable(x.id) || undefined}
            icon={!reachable(x.id) ? <IconLock size={16} /> : undefined}
            data-viewing={x.id === props.step || undefined}
            aria-current={x.id === props.step ? 'step' : undefined}
          />
        ))}
      </Stepper>
    </Stack>
  )

  const pinnedBar = pinned ? (
    <Group
      className="app-pinned"
      h={PINNED_H}
      justify="space-between"
      gap="xs"
      wrap="nowrap"
    >
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" fw={700} truncate>
          {STEPS.find((s) => s.id === props.step)?.label}
        </Text>
        <Text size="sm" c={INFO_TEXT} truncate>
          {props.status}
        </Text>
      </Box>
      {/* Only the way forward; "…" stays in the full card. */}
      <Box style={{ flexShrink: 0 }}>{forward('sm')}</Box>
    </Group>
  ) : null

  return { content, pinnedBar }
}
