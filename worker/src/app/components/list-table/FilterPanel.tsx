// The contents of the Filters sheet (bottom drawer on phones, popover on
// desktop). Changes apply straight away; the footer button just closes it.
import {
  Button,
  Checkbox,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import { useState } from 'react'
import { STICKY_FOOTER } from './ColumnPanel'
import { DEFAULT_PERIODS, countWith, formatPeriod, samePeriod } from './filters'
import type {
  FilterContext,
  FilterValue,
  OptionsFilter,
  Period,
  PickFilter,
  PeriodUnit,
  WithinFilter,
} from './filters'

interface PanelProps<T> {
  ctx: FilterContext<T>
  idPrefix: string
  setValue: (id: string, value: FilterValue | undefined) => void
  canReset: boolean
  onReset: () => void
  onDone: () => void
  doneLabel: string
}

export function FilterPanel<T>(props: PanelProps<T>) {
  return (
    <Stack gap="md">
      {props.ctx.defs.map((def, i) => (
        <Stack key={def.id} gap="xs" id={`${props.idPrefix}-${def.id}`}>
          {i > 0 && <Divider />}
          <Text fw={600} size="sm">
            {def.label}
          </Text>
          {def.kind === 'within' ? (
            <WithinSection def={def} {...props} />
          ) : def.kind === 'pick' ? (
            <PickSection def={def} {...props} />
          ) : def.multiple ? (
            <MultiSection def={def} {...props} />
          ) : (
            <SingleSection def={def} {...props} />
          )}
        </Stack>
      ))}
      {/* Stays in view when the list scrolls. */}
      <Group justify="space-between" style={STICKY_FOOTER}>
        <Button
          variant="subtle"
          onClick={props.onReset}
          disabled={!props.canReset}
        >
          Reset
        </Button>
        <Button onClick={props.onDone}>{props.doneLabel}</Button>
      </Group>
    </Stack>
  )
}

/**
 * Pick several (DECISIONS.md, "Multi-select filters"): radios "Any" / "Only
 * these", with the options nested under "Only these". Ticking an option
 * selects "Only these"; unticking the last one goes back to "Any", so the
 * filter can never be "only these" with nothing in it.
 */
function MultiSection<T>(props: PanelProps<T> & { def: OptionsFilter<T> }) {
  const { def, ctx } = props
  const value = ctx.state[def.id]
  const picked = asList(value)
  // The radio follows the value (an empty list = "Only these", nothing yet),
  // so Reset and the pill's ✕ put it back on "Any".
  const only = Array.isArray(value)
  const set = (next: string[]) =>
    props.setValue(def.id, next.length ? next : undefined)
  const chooseOnly = () => props.setValue(def.id, picked)
  return (
    <Stack gap={6}>
      <AnyOrOnly
        only={only}
        anyLabel={withCount(
          def,
          def.anyLabel ?? 'Any',
          countWith(ctx, def.id, undefined),
        )}
        onlyLabel={def.onlyLabel ?? 'Only these'}
        onAny={() => set([])}
        onOnly={chooseOnly}
      />
      <SimpleGrid
        cols={def.options.length > 4 ? 2 : 1}
        spacing="xs"
        verticalSpacing={6}
        pl={28}
      >
        {def.options.map((o) => (
          <Checkbox
            key={o.value}
            label={withCount(def, o.label, countWith(ctx, def.id, [o.value]))}
            checked={picked.includes(o.value)}
            onChange={(e) =>
              set(
                e.currentTarget.checked
                  ? [...picked, o.value]
                  : picked.filter((v) => v !== o.value),
              )
            }
          />
        ))}
      </SimpleGrid>
      {only && picked.length === 0 && <PickHint />}
    </Stack>
  )
}

/**
 * Pick from a long list with a search box (Mantine MultiSelect), under the
 * same "Any" / "Only these" radios. Lab: e.g. players on the stats screen.
 */
function PickSection<T>(props: PanelProps<T> & { def: PickFilter<T> }) {
  const { def, ctx } = props
  const value = ctx.state[def.id]
  const picked = asList(value)
  // The radio follows the value (an empty list = "Only these", nothing yet),
  // so Reset and the pill's ✕ put it back on "Any".
  const only = Array.isArray(value)
  const set = (next: string[]) =>
    props.setValue(def.id, next.length ? next : undefined)
  const chooseOnly = () => props.setValue(def.id, picked)
  const names = new Map(ctx.records.map((r) => [def.value(r), def.name(r)]))
  const data = [...names]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <Stack gap={6}>
      <AnyOrOnly
        only={only}
        anyLabel={def.anyLabel ?? 'Any'}
        onlyLabel={def.onlyLabel ?? 'Only these'}
        onAny={() => set([])}
        onOnly={chooseOnly}
      />
      <MultiSelect
        pl={28}
        aria-label={def.onlyLabel ?? def.label}
        data={data}
        value={picked}
        onChange={set}
        onFocus={() => !only && chooseOnly()}
        placeholder={picked.length ? undefined : (def.placeholder ?? 'Search…')}
        searchable
        clearable
        // Only the clear button, and nothing while empty: the chevron opens
        // nothing more than typing (null stops Mantine's default chevron).
        clearSectionMode="clear"
        rightSection={picked.length ? undefined : null}
        nothingFoundMessage="No one matches"
        // Inside the popover: a portal would count as a click outside it.
        comboboxProps={{ withinPortal: false }}
      />
      {only && picked.length === 0 && <PickHint />}
    </Stack>
  )
}

function withCount<T>(def: OptionsFilter<T>, label: string, n: number) {
  return def.counts === false ? label : `${label} (${n})`
}

function AnyOrOnly(props: {
  only: boolean
  anyLabel: string
  onlyLabel: string
  onAny: () => void
  onOnly: () => void
}) {
  return (
    <Radio.Group
      value={props.only ? 'only' : 'any'}
      onChange={(v) => (v === 'any' ? props.onAny() : props.onOnly())}
    >
      <Stack gap={6}>
        <Radio value="any" label={props.anyLabel} />
        <Radio value="only" label={props.onlyLabel} />
      </Stack>
    </Radio.Group>
  )
}

function PickHint() {
  return (
    <Text size="xs" c="var(--club-info-text)" pl={28}>
      Pick one or more. Until then, this filter shows everyone.
    </Text>
  )
}

function SingleSection<T>(props: PanelProps<T> & { def: OptionsFilter<T> }) {
  const { def, ctx } = props
  return (
    <Radio.Group
      value={asList(ctx.state[def.id])[0] ?? ''}
      onChange={(v) => props.setValue(def.id, v ? [v] : undefined)}
    >
      <Stack gap={6}>
        <Radio value="" label={`Any (${countWith(ctx, def.id, undefined)})`} />
        {def.options.map((o) => (
          <Radio
            key={o.value}
            value={o.value}
            label={`${o.label} (${countWith(ctx, def.id, [o.value])})`}
          />
        ))}
      </Stack>
    </Radio.Group>
  )
}

const UNITS: { value: PeriodUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
]

function WithinSection<T>(props: PanelProps<T> & { def: WithinFilter<T> }) {
  const { def, ctx } = props
  const presets = def.presets ?? DEFAULT_PERIODS
  const value = ctx.state[def.id]
  const period = value && !Array.isArray(value) ? value : undefined
  const isPreset = period ? presets.some((p) => samePeriod(p, period)) : false
  // Stays on "Custom" while editing, even if the numbers match a preset.
  const [custom, setCustom] = useState(period !== undefined && !isPreset)
  const selected = !period ? '' : custom || !isPreset ? 'custom' : key(period)

  return (
    <Radio.Group
      value={selected}
      onChange={(v) => {
        if (v === 'custom') {
          setCustom(true)
          props.setValue(def.id, period ?? { n: 2, unit: 'week' })
          return
        }
        setCustom(false)
        props.setValue(
          def.id,
          presets.find((p) => key(p) === v),
        )
      }}
    >
      <Stack gap={6}>
        <Radio
          value=""
          label={`Any time, or never (${countWith(ctx, def.id, undefined)})`}
        />
        {presets.map((p) => (
          <Radio
            key={key(p)}
            value={key(p)}
            label={`Within ${formatPeriod(p)} (${countWith(ctx, def.id, p)})`}
          />
        ))}
        <Radio value="custom" label="Custom…" />
        {selected === 'custom' && period && (
          <Group gap="xs" pl={28} wrap="nowrap">
            <Text size="sm">Within</Text>
            <NumberInput
              aria-label="Number"
              value={period.n}
              min={1}
              max={999}
              w={80}
              onChange={(n) =>
                props.setValue(def.id, {
                  ...period,
                  n: Math.max(1, Number(n) || 1),
                })
              }
            />
            <Select
              aria-label="Unit"
              data={UNITS}
              value={period.unit}
              allowDeselect={false}
              w={110}
              onChange={(u) =>
                u && props.setValue(def.id, { ...period, unit: u })
              }
            />
          </Group>
        )}
      </Stack>
    </Radio.Group>
  )
}

function key(p: Period) {
  return `${p.n}-${p.unit}`
}

function asList(v: FilterValue | undefined): string[] {
  return Array.isArray(v) ? v : []
}
