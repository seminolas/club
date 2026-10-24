// Shared cells for numbers (DECISIONS.md, "Grouped columns"): the same colours
// everywhere, in both themes (Mantine's -text colours adapt to the scheme).
import { Text } from '@mantine/core'

const GOOD = 'var(--mantine-color-teal-text)'
const BAD = 'var(--mantine-color-red-text)'

/** "No value": a dimmed dash. */
export function NoValue() {
  return (
    <Text span size="sm" c="dimmed">
      –
    </Text>
  )
}

/** A signed change: "+3" good, "−2" bad, "—" for none. */
export function Delta(props: {
  value: number | null
  goodWhen?: 'up' | 'down'
}) {
  const v = props.value
  if (v === null) return <NoValue />
  if (v === 0)
    return (
      <Text span size="sm" c="dimmed">
        —
      </Text>
    )
  const good = props.goodWhen === 'down' ? v < 0 : v > 0
  return (
    <Text span size="sm" c={good ? GOOD : BAD}>
      {v > 0 ? `+${v}` : `−${-v}`}
    </Text>
  )
}

/** A count of wins or losses, coloured when not zero. */
export function Count(props: { value: number; kind: 'win' | 'loss' }) {
  if (props.value === 0)
    return (
      <Text span size="sm">
        0
      </Text>
    )
  return (
    <Text span size="sm" c={props.kind === 'win' ? GOOD : BAD}>
      {props.value}
    </Text>
  )
}

/** A share as a whole percentage; good from 50%. */
export function Percent(props: { value: number | null }) {
  if (props.value === null) return <NoValue />
  return (
    <Text span size="sm" c={props.value >= 0.5 ? GOOD : BAD}>
      {Math.round(props.value * 100)}%
    </Text>
  )
}
