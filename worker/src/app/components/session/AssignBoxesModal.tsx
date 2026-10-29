// Assign boxes (old UI's modal, which the lab left out): every way to split
// the players coming into boxes (most boxes first), the previous layout first
// when there is one (the current boxes on Reassign, or the boxes cleared by
// Re-open check-in), and Custom: the selected layout as editable text, one
// box per line. Every option goes through the same check before Assign.
import {
  Button,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { useState } from 'react'
import {
  buildBoxes,
  boxSizeOptions,
  parseBoxLayout,
} from '../../../domain/boxes'
import { SUPPORTED_BOX_SIZES, scheduleBox } from '../../../domain/pairings'
import type { BoxInput } from '../../../types'
import { INFO_TEXT } from '../../lib/colors'
import { boxName } from '../../lib/names'

export interface Person {
  id: number
  name: string
  preferredName: string | null
}

interface Option {
  previous?: boolean
  sizes: number[]
  boxCount: number
  layout: number[][]
}

/** "2 boxes of 5, 1 box of 6 — 3 boxes total" (old UI's wording). */
function optionLabel(o: Option) {
  const counts = new Map<number, number>()
  o.sizes.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1))
  const parts = [...counts]
    .sort(([a], [b]) => a - b)
    .map(([size, n]) => `${n} box${n > 1 ? 'es' : ''} of ${size}`)
  const label = `${parts.join(', ')} — ${o.boxCount} box${o.boxCount > 1 ? 'es' : ''} total`
  return o.previous ? `Previous layout: ${label}` : label
}

/** Fresh boxes from a layout of player ids, with their matches. */
export function boxesFromLayout(layout: number[][]): BoxInput[] {
  return layout.map((players) => ({
    players,
    matches: scheduleBox(players).map((pairs) => ({ pairs, sets: [] })),
    finalPlacings: null,
  }))
}

export function AssignBoxesModal(props: {
  opened: boolean
  /** The players coming, best ladder position first. */
  players: Person[]
  /** The previous layout (player ids per box), if any. */
  previous: number[][] | null
  onClose: () => void
  onAssign: (boxes: BoxInput[]) => Promise<void>
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Assign boxes"
      size="lg"
      centered
    >
      {props.opened && <AssignForm {...props} />}
    </Modal>
  )
}

function AssignForm(props: {
  players: Person[]
  previous: number[][] | null
  onClose: () => void
  onAssign: (boxes: BoxInput[]) => Promise<void>
}) {
  const ids = props.players.map((p) => p.id)
  const [options] = useState<Option[]>(() => {
    const opts: Option[] = boxSizeOptions(ids.length, SUPPORTED_BOX_SIZES).map(
      (o) => ({ ...o, layout: buildBoxes(ids, o.sizes) }),
    )
    if (props.previous) {
      const layout = props.previous
        .map((box) => box.filter((id) => ids.includes(id)))
        .filter((box) => box.length)
      opts.unshift({
        previous: true,
        sizes: layout.map((b) => b.length),
        boxCount: layout.length,
        layout,
      })
    }
    return opts
  })
  const [selected, setSelected] = useState(0)
  const [custom, setCustom] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const byId = new Map(props.players.map((p) => [p.id, p]))
  const display = (id: number) => {
    const p = byId.get(id)
    return p ? boxName(p, props.players) : String(id)
  }
  const preview = (options[selected]?.layout ?? [])
    .map((box) => box.map(display).join(', '))
    .join('\n')
  const parsed = parseBoxLayout(
    custom ?? preview,
    new Map(props.players.map((p) => [display(p.id), p.id])),
  )

  return (
    <Stack gap="sm">
      <Text size="sm" c={INFO_TEXT}>
        Choose how to split {ids.length} players into boxes.
      </Text>
      <Radio.Group
        value={custom === null ? String(selected) : 'custom'}
        onChange={(v) => {
          if (v === 'custom') {
            // Custom starts from the selected option; picking an option and
            // then Custom again is the way to reset an edit.
            if (custom === null) setCustom(preview)
          } else {
            setSelected(Number(v))
            setCustom(null)
          }
        }}
      >
        <Stack gap={6}>
          {options.map((o, i) => (
            <Radio key={i} value={String(i)} label={optionLabel(o)} />
          ))}
          <Radio value="custom" label="Custom — edit the selected layout" />
        </Stack>
      </Radio.Group>
      <Textarea
        label={
          custom === null
            ? 'Preview'
            : 'Custom (one box per line, names separated by commas)'
        }
        value={custom ?? preview}
        readOnly={custom === null}
        onChange={(e) => setCustom(e.currentTarget.value)}
        autosize
        minRows={4}
        maxRows={12}
        spellCheck={false}
        ff="monospace"
        styles={{ input: { fontSize: 'var(--mantine-font-size-sm)' } }}
      />
      {parsed.errors.length > 0 && (
        <Stack gap={2}>
          {parsed.errors.map((e, i) => (
            <Text key={i} size="sm" c="red">
              {e}
            </Text>
          ))}
        </Stack>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={parsed.errors.length > 0}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            await props.onAssign(boxesFromLayout(parsed.layout))
            setBusy(false)
          }}
        >
          Assign
        </Button>
      </Group>
    </Stack>
  )
}
