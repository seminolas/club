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

export interface SessionCardProps {
  title: string
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
  /** The step's own word buttons. */
  stepActions?: ReactNode
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
  // Going back undoes work and is rare: in a "…" menu, left of the way
  // forward. The one icon-only button (developer); named for screen readers.
  const menu =
    props.menu.length > 0 ? (
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
      <span className="app-pill-label">{label}:</span> {value}
    </Badge>
  )
  const titleLine = (
    // Phones: the pills always get their own row, so the card keeps its
    // shape from state to state; wider screens: one line.
    <Group gap="xs" display={phone ? 'block' : undefined}>
      <Text fw={600} mb={phone ? 6 : 0}>
        {props.title}
      </Text>
      <Group gap={6}>
        {pill('Date', props.dateLabel)}
        {pill('Status', PHASE_LABEL[props.phase], true)}
        {pill(...props.count)}
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
      {/* The actions wrap under the title on phones when there isn't room. */}
      <Group justify="space-between" align="flex-start" gap="sm">
        {titleLine}
        {(menu || props.forward) && (
          <Group gap="xs" wrap="nowrap" ml="auto">
            {menu}
            {forward()}
          </Group>
        )}
      </Group>
      {props.note}
      {props.stepActions && <Group gap="xs">{props.stepActions}</Group>}
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
