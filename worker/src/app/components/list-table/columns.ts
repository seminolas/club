// ListTable's own column types. Pages describe columns with these, never with
// the table library's types, so the library behind ListTable can change
// (DECISIONS.md, "Table library") without touching any page.
import type { ReactNode } from 'react'

export interface ListColumn<T> {
  /** The row field this column shows and sorts by; also its id. */
  accessor: string
  title?: string
  /**
   * Shown instead of `title` when full titles would make the table wider
   * than its box; the whole table switches at once (DECISIONS.md, "Column
   * widths"), e.g. "W" for "Won". The full title stays available to screen
   * readers and as a tooltip.
   */
  shortTitle?: string
  /** Defaults to the field's value as text. */
  render?: (record: T, index: number) => ReactNode
  sortable?: boolean
  /** Start sorting this column highest first (e.g. wins, win %). */
  sortDescFirst?: boolean
  /** Right-aligned, with even-width digits. */
  numeric?: boolean
  width?: number | string
  textAlign?: 'left' | 'center' | 'right'
  /** Shown by default only when this matches, e.g. '(min-width: 36em)'. */
  visibleMediaQuery?: string
  /** Hidden until the viewer turns it on in Columns. */
  defaultHidden?: boolean
  /** false: always shown, and not listed as optional in Columns. */
  toggleable?: boolean
}

/**
 * Columns under one heading (a two-row header), shown or hidden together in
 * Columns, e.g. "Matches: Total, Won, Lost, Win%".
 */
export interface ListColumnGroup<T> {
  group: string
  title: string
  columns: ListColumn<T>[]
  /** Defaults for every column in the group. */
  visibleMediaQuery?: string
  defaultHidden?: boolean
}

export type ListColumnDef<T> = ListColumn<T> | ListColumnGroup<T>

export interface ListSort {
  column: string
  direction: 'asc' | 'desc'
}

export function isGroup<T>(c: ListColumnDef<T>): c is ListColumnGroup<T> {
  return 'group' in c
}

/**
 * A group's id in visibility choices and in the table library. Prefixed, so
 * a group can share a name with a column (e.g. group "sets", column "sets").
 */
export function groupId<T>(g: ListColumnGroup<T>): string {
  return `group:${g.group}`
}

/**
 * A group's checkbox in Columns, from its columns: ticked when all are shown,
 * a dash ("indeterminate") when only some are. Clicking it shows all, unless
 * all are already shown, in which case it hides all.
 */
export function groupCheckbox(shown: boolean[]): {
  checked: boolean
  indeterminate: boolean
  next: boolean
} {
  const all = shown.length > 0 && shown.every(Boolean)
  const some = shown.some(Boolean)
  return { checked: all, indeterminate: some && !all, next: !all }
}

/** Every column, in order, with the group it belongs to (if any). */
export function leafColumns<T>(
  defs: ListColumnDef<T>[],
): { column: ListColumn<T>; group?: ListColumnGroup<T> }[] {
  return defs.flatMap((d) =>
    isGroup(d)
      ? d.columns.map((column) => ({ column, group: d }))
      : [{ column: d }],
  )
}

/**
 * Whether a column shows before the viewer changes anything: not hidden by
 * default (itself or its group), and its screen-size queries match.
 */
export function shownByDefault<T>(
  column: ListColumn<T>,
  group: ListColumnGroup<T> | undefined,
  matches: (query: string) => boolean,
): boolean {
  if (column.defaultHidden ?? group?.defaultHidden) return false
  return [column.visibleMediaQuery, group?.visibleMediaQuery].every(
    (q) => !q || matches(q),
  )
}

/** The field a column sorts by; null and missing both count as "no value". */
export function fieldValue<T>(record: T, accessor: string): unknown {
  return (record as Record<string, unknown>)[accessor] ?? undefined
}

/** Ascending comparison of two present values: numbers by size, else as text. */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean')
    return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en-NZ', { numeric: true })
}
