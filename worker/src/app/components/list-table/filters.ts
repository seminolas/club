// Filter model for ListTable (DECISIONS.md, "Filtering" and "Search vs
// filters"). Screens declare filters; ListTable builds the sheet, the pills
// and the counts from them. Pure functions, so they're unit-tested.

export type PeriodUnit = 'day' | 'week' | 'month' | 'year'

export interface Period {
  n: number
  unit: PeriodUnit
}

export interface FilterOption<T> {
  value: string
  label: string
  /** Pill text when this is the only option picked, e.g. "On the ladder". */
  pill?: string
  /** Shorter text when listed with others in a pill, e.g. "2" for "Box 2". */
  short?: string
  test: (record: T) => boolean
}

/** What every kind of filter has. */
interface FilterBase {
  /**
   * The column that already shows this filter's value, e.g. a session's
   * Date. While it's visible, a hidden match gives no reason for this
   * filter: the row already shows it (DECISIONS.md, "Sessions list").
   */
  column?: string
}

/** Pick one (or several, with `multiple`) of a fixed set of options. */
export interface OptionsFilter<T> extends FilterBase {
  kind: 'options'
  id: string
  label: string
  /**
   * Pick several: shown as "Any" / "Only these" with the options nested under
   * "Only these" (DECISIONS.md, "Multi-select filters").
   */
  multiple?: boolean
  /** Text of the "Any" radio, e.g. "Any box". Default "Any". */
  anyLabel?: string
  /** false: no "(12)" counts after the option labels, e.g. for boxes. */
  counts?: boolean
  /** Text of the "Only these" radio, e.g. "Only these boxes". */
  onlyLabel?: string
  options: FilterOption<T>[]
}

/**
 * Pick from a long list (e.g. players) with a search box: "Any" / "Only
 * these" plus a searchable multi-select. Options come from the records.
 */
export interface PickFilter<T> extends FilterBase {
  kind: 'pick'
  id: string
  label: string
  anyLabel?: string
  onlyLabel?: string
  /** The value a record is picked by, e.g. its id. */
  value: (record: T) => string
  /** How a record's value is named in the list, e.g. a full name. */
  name: (record: T) => string
  /** Shorter name for the pill, e.g. a display name. Defaults to `name`. */
  shortName?: (record: T) => string
  placeholder?: string
}

/** A date within the last N days/weeks/months/years. No date never matches. */
export interface WithinFilter<T> extends FilterBase {
  kind: 'within'
  id: string
  label: string
  date: (record: T) => string | null
  presets?: Period[]
}

export type FilterDef<T> = OptionsFilter<T> | WithinFilter<T> | PickFilter<T>

/**
 * Options and pick filters hold the picked values; within filters a period.
 * For "pick several" filters, an empty list means "Only these" was chosen but
 * nothing is picked yet: it filters nothing, but keeps the radio on "Only
 * these". No value (undefined) means "Any". Reset and ✕ clear the value.
 */
export type FilterValue = string[] | Period

/** Filter id → value. A missing id means that filter isn't applied. */
export type FilterState = Record<string, FilterValue | undefined>

export const DEFAULT_PERIODS: Period[] = [
  { n: 1, unit: 'month' },
  { n: 3, unit: 'month' },
  { n: 6, unit: 'month' },
]

export function isActive(value: FilterValue | undefined): value is FilterValue {
  return value !== undefined && (!Array.isArray(value) || value.length > 0)
}

export function periodStart(p: Period, now: number): number {
  const d = new Date(now)
  if (p.unit === 'day') d.setDate(d.getDate() - p.n)
  if (p.unit === 'week') d.setDate(d.getDate() - 7 * p.n)
  if (p.unit === 'month') d.setMonth(d.getMonth() - p.n)
  if (p.unit === 'year') d.setFullYear(d.getFullYear() - p.n)
  return d.getTime()
}

export function formatPeriod(p: Period): string {
  return `${p.n} ${p.n === 1 ? p.unit : `${p.unit}s`}`
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.n === b.n && a.unit === b.unit
}

export function matchesFilter<T>(
  def: FilterDef<T>,
  value: FilterValue,
  record: T,
  now: number,
): boolean {
  if (def.kind === 'options') {
    const picked = Array.isArray(value) ? value : []
    return def.options.some((o) => picked.includes(o.value) && o.test(record))
  }
  if (def.kind === 'pick')
    return Array.isArray(value) && value.includes(def.value(record))
  if (Array.isArray(value)) return true
  const iso = def.date(record)
  return iso !== null && new Date(iso).getTime() >= periodStart(value, now)
}

/** The active filters that hide `record`. */
export function rejectedBy<T>(
  defs: FilterDef<T>[],
  state: FilterState,
  record: T,
  now: number,
): FilterDef<T>[] {
  return defs.filter((d) => {
    const v = state[d.id]
    return isActive(v) && !matchesFilter(d, v, record, now)
  })
}

/** Why a hidden row is hidden, in terms of its own value: "Last played: Mar 2024". */
export function describeRecord<T>(def: FilterDef<T>, record: T): string {
  if (def.kind === 'within') {
    const iso = def.date(record)
    const when = iso
      ? new Date(iso).toLocaleDateString('en-NZ', {
          month: 'short',
          year: 'numeric',
        })
      : 'never'
    return `${def.label}: ${when}`
  }
  if (def.kind === 'pick') return `Not in ${def.label.toLowerCase()} picked`
  const own = def.options.find((o) => o.test(record))
  if (!own) return def.label
  return own.pill ?? `${def.label}: ${own.label}`
}

/** Lower-case and strip accents, so "muller" finds "Müller". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Every word of the query appears somewhere in the text. */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  const t = normalize(text)
  return q.split(/\s+/).every((word) => t.includes(word))
}

export interface FilterContext<T> {
  records: T[]
  defs: FilterDef<T>[]
  state: FilterState
  /**
   * Text the search box matches. Several texts (e.g. one per player in a
   * box): the record matches when any one of them has every word.
   */
  searchText: (record: T) => string | string[]
  /**
   * More texts the search matches that no column shows, e.g. a session's
   * players (DECISIONS.md, "Search matches outside the columns"). Any one
   * text with every word is enough.
   */
  searchAlso?: (record: T) => string[]
  query: string
  now: number
}

/**
 * `shown`: matches the search and every active filter.
 * `hidden`: matches the search but some filter hides it (only while searching).
 */
export function applyFilters<T>(ctx: FilterContext<T>): {
  shown: T[]
  hidden: T[]
} {
  const shown: T[] = []
  const hidden: T[] = []
  const searching = normalize(ctx.query) !== ''
  for (const r of ctx.records) {
    const texts = ctx.searchText(r)
    const hit =
      (Array.isArray(texts)
        ? texts.some((t) => matchesSearch(t, ctx.query))
        : matchesSearch(texts, ctx.query)) ||
      (searching &&
        alsoMatches(ctx.searchAlso?.(r) ?? [], ctx.query).length > 0)
    if (!hit) continue
    if (rejectedBy(ctx.defs, ctx.state, r, ctx.now).length === 0) shown.push(r)
    else if (searching) hidden.push(r)
  }
  return { shown, hidden }
}

/** The texts that match the search on their own (none while not searching). */
export function alsoMatches(texts: string[], query: string): string[] {
  if (normalize(query) === '') return []
  return texts.filter((t) => matchesSearch(t, query))
}

/**
 * Splits `text` into parts, marking those that contain a search word, for
 * bold highlights: "Dev Singh" with "dev s" → [Dev] [ ] [S] [ingh]. Matching
 * ignores case and accents, as the search does.
 */
export function highlightParts(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  // One normalized character per original one, so positions line up.
  const chars = [...text]
  const flat = chars.map((c) => normalize(c) || c.toLowerCase()).join('')
  const sameLength = flat.length === chars.length
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const hit = chars.map(() => false)
  if (sameLength)
    for (const w of words)
      for (let i = flat.indexOf(w); i !== -1; i = flat.indexOf(w, i + 1))
        for (let j = i; j < i + w.length; j++) hit[j] = true
  const parts: { text: string; hit: boolean }[] = []
  chars.forEach((c, i) => {
    const last = parts[parts.length - 1]
    if (last && last.hit === hit[i]) last.text += c
    else parts.push({ text: c, hit: hit[i] })
  })
  return parts
}

/** How many rows would show if filter `id` were set to `value` (others as they are). */
export function countWith<T>(
  ctx: FilterContext<T>,
  id: string,
  value: FilterValue | undefined,
): number {
  return applyFilters({ ...ctx, state: { ...ctx.state, [id]: value } }).shown
    .length
}

/** Names in a pill: the first two, then "+N", e.g. "Ben, Aroha +2". */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

export function pillLabel<T>(
  def: FilterDef<T>,
  value: FilterValue,
  records: T[] = [],
): string {
  if (def.kind === 'pick') {
    const picked = Array.isArray(value) ? value : []
    const short = def.shortName ?? def.name
    const names = new Map(records.map((r) => [def.value(r), short(r)]))
    return `${def.label}: ${nameList(picked.map((v) => names.get(v) ?? v))}`
  }
  if (def.kind === 'within')
    return Array.isArray(value)
      ? def.label
      : `${def.label}: within ${formatPeriod(value)}`
  const picked = def.options.filter(
    (o) => Array.isArray(value) && value.includes(o.value),
  )
  if (picked.length === 1 && picked[0].pill) return picked[0].pill
  return `${def.label}: ${picked.map((o) => o.short ?? o.label).join(', ')}`
}

function activeOnly(state: FilterState): Record<string, FilterValue> {
  const out: Record<string, FilterValue> = {}
  for (const id of Object.keys(state).sort()) {
    const v = state[id]
    if (isActive(v)) out[id] = Array.isArray(v) ? [...v].sort() : v
  }
  return out
}

export function sameState(a: FilterState, b: FilterState): boolean {
  return JSON.stringify(activeOnly(a)) === JSON.stringify(activeOnly(b))
}

export function activeCount(state: FilterState): number {
  return Object.keys(activeOnly(state)).length
}
