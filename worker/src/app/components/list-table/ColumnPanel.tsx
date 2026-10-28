// The contents of the Columns sheet (bottom drawer on phones, popover on
// desktop). Changes apply straight away. Grouped columns are a small tree: a
// group checkbox (ticked / dash / empty) with its columns indented below.
import { Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import { groupCheckbox } from './columns'

export interface ColumnChoice {
  key: string
  label: string
  shown: boolean
  /** Always shown, e.g. the player name. */
  locked: boolean
  /** What the column is, under its name. */
  description?: string
}

/** A column on its own, or a group with its columns. */
export type ColumnChoiceItem =
  | ({ kind: 'column' } & ColumnChoice)
  | { kind: 'group'; key: string; label: string; columns: ColumnChoice[] }

export function ColumnPanel(props: {
  items: ColumnChoiceItem[]
  /** Show or hide these columns (one, or all of a group's). */
  onToggle: (keys: string[], shown: boolean) => void
  canReset: boolean
  onReset: () => void
  onDone: () => void
  phone: boolean
}) {
  const box = (c: ColumnChoice, ariaLabel?: string) => (
    <Checkbox
      key={c.key}
      label={c.locked ? `${c.label} (always shown)` : c.label}
      description={c.description}
      styles={{ description: { color: 'var(--club-info-text)' } }}
      aria-label={ariaLabel}
      checked={c.shown}
      disabled={c.locked}
      onChange={(e) => props.onToggle([c.key], e.currentTarget.checked)}
    />
  )
  return (
    <Stack gap="sm">
      <Stack gap={6}>
        {props.items.map((item) => {
          if (item.kind === 'column') return box(item)
          const open = item.columns.filter((c) => !c.locked)
          const state = groupCheckbox(open.map((c) => c.shown))
          return (
            <Stack key={item.key} gap={6}>
              <Checkbox
                label={item.label}
                checked={state.checked}
                indeterminate={state.indeterminate}
                onChange={() =>
                  props.onToggle(
                    open.map((c) => c.key),
                    state.next,
                  )
                }
              />
              <Stack gap={6} pl={28}>
                {item.columns.map((c) => box(c, `${item.label}: ${c.label}`))}
              </Stack>
            </Stack>
          )
        })}
      </Stack>
      {props.phone && (
        <Text size="xs" c="var(--club-info-text)">
          Extra columns may make the table scroll sideways.
        </Text>
      )}
      {/* Stays in view when the list scrolls. */}
      <Group justify="space-between" style={STICKY_FOOTER}>
        <Button
          variant="subtle"
          onClick={props.onReset}
          disabled={!props.canReset}
        >
          Reset
        </Button>
        <Button onClick={props.onDone}>Done</Button>
      </Group>
    </Stack>
  )
}

/**
 * Footer of a sheet or popover that stays visible while its list scrolls. It
 * also covers the container's bottom and side padding (--lt-sheet-pad, set by
 * ListTable), so rows can't peek out below it and its background and line
 * run the full width.
 */
export const STICKY_FOOTER = {
  position: 'sticky',
  bottom: 'calc(-1 * var(--lt-sheet-pad, 0px))',
  marginBottom: 'calc(-1 * var(--lt-sheet-pad, 0px))',
  paddingBottom: 'calc(var(--mantine-spacing-xs) + var(--lt-sheet-pad, 0px))',
  // Full width: also over the container's side padding (--lt-sheet-pad-x).
  marginInline: 'calc(-1 * var(--lt-sheet-pad-x, 0px))',
  paddingInline: 'var(--lt-sheet-pad-x, 0px)',
  background: 'var(--mantine-color-body)',
  paddingTop: 'var(--mantine-spacing-xs)',
  borderTop: '1px solid var(--mantine-color-default-border)',
} as const
