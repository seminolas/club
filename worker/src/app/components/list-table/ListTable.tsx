// The table + actions component (DECISIONS.md): search, filters, hidden
// matches, columns, rapid row actions, one card with tinted layers.
// TanStack Table (headless) holds sorting and column visibility; the markup is
// Mantine's Table, so section rows, stripes, the active row and grid roles are
// ordinary markup (DECISIONS.md, "Table library").
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Collapse,
  Drawer,
  Group,
  Popover,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import {
  useElementSize,
  useMediaQuery,
  useReducedMotion,
  useViewportSize,
} from '@mantine/hooks'
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconSearch,
  IconSelector,
} from '@tabler/icons-react'
import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type {
  ColumnDef,
  ExpandedState,
  Row,
  SortingState,
} from '@tanstack/react-table'
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { defaultActive, moveActive } from './activeRow'
import { ColumnPanel } from './ColumnPanel'
import type { ColumnChoice, ColumnChoiceItem } from './ColumnPanel'
import {
  compareValues,
  fieldValue,
  groupId,
  isGroup,
  leafColumns,
  shownByDefault,
} from './columns'
import type { ListColumn, ListColumnDef, ListSort } from './columns'
import { FilterPanel } from './FilterPanel'
import './ListTable.css'
import {
  activeCount,
  alsoMatches,
  applyFilters,
  describeRecord,
  highlightParts,
  isActive,
  pillLabel,
  rejectedBy,
  sameState,
} from './filters'
import type { FilterDef, FilterState, FilterValue } from './filters'

// Module scope, as TanStack asks: a stable feature registry.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  // Open/closed state for rows with a detail panel (DECISIONS.md, "Rows
  // that expand"). No sub-rows, so no expanded row model.
  rowExpandingFeature,
})

/** A row's main action, shown as a word-labelled button. */
export interface PrimaryAction {
  label: string
  run: () => void
  /** Already done (e.g. "Coming ✓"): a quieter button. */
  done?: boolean
  /**
   * The action moves focus itself (e.g. into a score field in the row's
   * detail panel), so the search box doesn't take it back.
   */
  keepFocus?: boolean
  /** An icon before the label, e.g. a chevron on Expand / Collapse. */
  icon?: ReactNode
  /** For an Expand / Collapse button: whether its panel is open. */
  expanded?: boolean
}

/** What a row's action or detail panel can do with its own row. */
export interface RowControls {
  expanded: boolean
  expand: () => void
  collapse: () => void
  toggle: () => void
  /** The detail panel's element id, e.g. to focus a field inside it. */
  detailId: string
}

export interface ListTableProps<T> {
  records: T[]
  /**
   * A function gets the rows that must be told apart, e.g. for display-name
   * clashes: everything the filters allow plus all hidden search matches.
   * The search box never shrinks this set, so names don't get shorter while
   * typing. Also gets the search text, e.g. to show full names of rows that
   * matched on a part of the name that the short label leaves out.
   */
  columns:
    ListColumnDef<T>[] | ((inView: T[], query: string) => ListColumnDef<T>[])
  getKey: (record: T) => string | number
  /** One text, or several (any one must match every word). */
  searchText: (record: T) => string | string[]
  /**
   * More texts to search that no column shows, e.g. a session's players. A
   * row that matches on them says so under its primary cell, with the
   * matched words in bold: "Played: Dev Singh, Dev Patel" (DECISIONS.md,
   * "Search matches outside the columns").
   */
  searchAlso?: {
    /** e.g. "Played". */
    label: string
    texts: (record: T) => string[]
    /** How many matches to list before "+N more" (default 3). */
    max?: number
  }
  searchPlaceholder?: string
  /** e.g. { one: 'player', many: 'players' }, for "Showing 9 of 45 players". */
  noun: { one: string; many: string }
  filters?: FilterDef<T>[]
  /** Filters applied when the screen opens, and what Reset goes back to. */
  defaultFilters?: FilterState
  /**
   * The row's main column (e.g. Player): the only one that takes spare
   * width, pinned while the table scrolls sideways, always shown, and where
   * the "why it's hidden" and `searchAlso` lines go.
   */
  primaryColumn?: string
  /** Heading of the hidden-matches section. */
  hiddenHeading?: (query: string, count: number) => ReactNode
  /** Offer "Add “<search>”" at the end of the results. */
  addNew?: { label: (query: string) => string; onAdd: (query: string) => void }
  /**
   * Page actions (e.g. "Import ladder", "Assign boxes"), in their own card
   * above the table card. Not part of the sticky header.
   */
  actions?: ReactNode
  /** Shown at the start of the actions card, e.g. "Tuesday Seniors ladder". */
  title?: ReactNode
  /**
   * The actions card's whole content, instead of `title` and `actions`, e.g.
   * a session's step indicator with the step's main action (DECISIONS.md,
   * "Session pages"). Same card, same place.
   */
  header?: ReactNode
  /**
   * The row's main action (e.g. "Mark coming"). While searching, the first
   * match is the active row; up/down move it, Enter runs its action, and the
   * search clears for the next name (W3C combobox-with-grid pattern).
   */
  primaryAction?: (record: T, row: RowControls) => PrimaryAction | null
  /**
   * A detail panel under the row (e.g. a box's games and scores). Rows open
   * and close by the row's primary action (e.g. an Expand / Collapse button,
   * DECISIONS.md "Opening a box"), or all at once with Expand all /
   * Collapse all. Tapping the row itself does nothing.
   */
  detail?: (record: T, row: RowControls) => ReactNode
  /** Column heading over the primary action buttons. */
  primaryActionTitle?: string
  /** Keep the search text after a primary action (default: clear it). */
  keepSearchAfterAction?: boolean
  rowActions?: (record: T) => ReactNode
  onRowClick?: (record: T) => void
  initialSort?: ListSort
  /**
   * No Columns button (e.g. small embedded tables). Otherwise every column can
   * be shown or hidden except the primary one and any with `toggleable: false`.
   */
  hideColumnChooser?: boolean
  /** Keep the search and filters at the top while the page scrolls. */
  stickyHeader?: boolean
  /**
   * Room above the sticky header for the page's own pinned bar, in px (e.g. a
   * session's compact step bar, DECISIONS.md "Session pages").
   */
  stickyTop?: number
  /** Fixed "now" for screenshots and tests. */
  now?: number
}

/**
 * The table, drawn in the browser only: it reads the screen size while
 * rendering (phone or desktop toolbar, per-size column defaults), which the
 * server can't know (UI-PORT.md, U1/U2). The data still arrives with the page.
 */
export function ListTable<T extends object>(props: ListTableProps<T>) {
  return (
    <ClientOnly fallback={<Skeleton height={320} radius="md" />}>
      <ListTableView {...props} />
    </ClientOnly>
  )
}

function ListTableView<T extends object>(props: ListTableProps<T>) {
  const defs = props.filters ?? []
  const defaults = props.defaultFilters ?? {}
  const idPrefix = useId().replace(/:/g, '')
  // Known on the first render, so a tap right after load isn't lost while the
  // toolbar swaps from popovers to drawers. (Client-only: see ListTable.)
  const phone =
    useMediaQuery('(max-width: 48em)', undefined, {
      getInitialValueInEffect: false,
    }) ?? false
  const [query, setQuery] = useState('')
  const [state, setState] = useState<FilterState>(defaults)
  const [sheet, setSheet] = useState<{ open: boolean; at?: string }>({
    open: false,
  })
  const [expanded, setExpanded] = useState<ExpandedState>({})
  // Rows whose panel has been opened stay mounted, so closing can animate
  // too; rows never opened cost nothing.
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [sorting, setSorting] = useState<SortingState>(
    props.initialSort
      ? [
          {
            id: props.initialSort.column,
            desc: props.initialSort.direction === 'desc',
          },
        ]
      : [],
  )
  // Column key → shown, only for columns the viewer changed. Not persisted.
  const [colChoice, setColChoice] = useState<Record<string, boolean>>({})
  const [colsOpen, setColsOpen] = useState(false)
  // Re-render on resize, so per-screen-size column defaults follow the window.
  useViewportSize()
  const now = props.now ?? Date.now()
  const inputRef = useRef<HTMLInputElement>(null)
  // The active row, tied to the search it was chosen for: a new search starts
  // again from the first match.
  const [activeFor, setActiveFor] = useState<{
    query: string
    index: number | null
  }>({ query: '', index: null })
  const toolbar = useElementSize()

  const ctx = {
    records: props.records,
    defs,
    state,
    searchText: props.searchText,
    searchAlso: props.searchAlso?.texts,
    query,
    now,
  }
  const result = applyFilters(ctx)
  const hiddenKeys = new Set(result.hidden.map(props.getKey))

  const setValue = (id: string, value: FilterValue | undefined) =>
    setState((prev) => ({ ...prev, [id]: value }))
  // Filters that differ from the defaults: drives the Reset next to the pills.
  const canReset = !sameState(state, defaults)
  // In the sheet, Reset also clears an "Only these" that has nothing picked
  // yet (an empty list), so its radio goes back to "Any".
  const canResetSheet =
    canReset ||
    Object.values(state).some((v) => Array.isArray(v) && v.length === 0)
  const reset = () => setState(defaults)
  // Closing the sheet turns "Only these, nothing picked" back into "Any".
  const closeSheet = () => {
    setSheet({ open: false })
    setState((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([, v]) => !(Array.isArray(v) && v.length === 0),
        ),
      ),
    )
  }
  const q = query.trim()
  const count = activeCount(state)
  const filtered = count > 0 || q !== ''
  const noun = (n: number) => (n === 1 ? props.noun.one : props.noun.many)

  const columnDefs =
    typeof props.columns === 'function'
      ? props.columns(
          [...applyFilters({ ...ctx, query: '' }).shown, ...result.hidden],
          query,
        )
      : props.columns
  const leaves = leafColumns(columnDefs)
  const allColumns = leaves.map((l) => l.column)
  const groupOf = new Map(
    leaves.flatMap((l) => (l.group ? [[l.column.accessor, l.group]] : [])),
  )

  // Column visibility: defaults (incl. per screen size) can be overridden in
  // the Columns sheet, column by column; a group's checkbox sets all of its
  // columns (DECISIONS.md, "Columns sheet").
  const matches = (q: string) => window.matchMedia(q).matches
  const defaultShown = (c: ListColumn<T>) =>
    shownByDefault(c, groupOf.get(c.accessor), matches)
  const isShown = (c: ListColumn<T>) => colChoice[c.accessor] ?? defaultShown(c)
  const choiceOf = (c: ListColumn<T>): ColumnChoice => ({
    key: c.accessor,
    label: c.title || c.accessor,
    shown: isShown(c),
    locked: c.accessor === props.primaryColumn || c.toggleable === false,
  })
  const choiceItems: ColumnChoiceItem[] = columnDefs.map((d) =>
    isGroup(d)
      ? {
          kind: 'group',
          key: groupId(d),
          label: d.title,
          columns: d.columns.map(choiceOf),
        }
      : { kind: 'column', ...choiceOf(d) },
  )
  const chooser =
    !props.hideColumnChooser && allColumns.some((c) => !choiceOf(c).locked)
  const colsChanged = allColumns.some(
    (c) => !choiceOf(c).locked && isShown(c) !== defaultShown(c),
  )

  // Extra, library-free columns: the row buttons, last.
  const columns: ListColumn<T>[] = [
    ...allColumns,
    ...(props.primaryAction
      ? [
          {
            accessor: '__primary',
            title: props.primaryActionTitle ?? '',
            textAlign: 'right' as const,
          },
        ]
      : []),
    ...(props.rowActions
      ? [{ accessor: '__actions', title: '', textAlign: 'right' as const }]
      : []),
  ]
  const byId = new Map(columns.map((c) => [c.accessor, c]))

  const leafDef = (c: ListColumn<T>): ColumnDef<typeof features, T> => ({
    id: c.accessor,
    accessorFn: (r) => fieldValue(r, c.accessor),
    enableSorting: Boolean(c.sortable),
    sortDescFirst: Boolean(c.sortDescFirst),
    sortUndefined: 'last',
    sortFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
  })

  // TanStack: sorting and visibility state, and the sorted row model. Filtering
  // and search are ours (filters.ts), so it only sees the rows that match.
  const table = useTable({
    features,
    data: [...result.shown, ...result.hidden],
    // Groups become TanStack group columns, which give the two header rows.
    columns: [
      ...columnDefs.map((d): ColumnDef<typeof features, T> =>
        isGroup(d)
          ? { id: groupId(d), header: d.title, columns: d.columns.map(leafDef) }
          : leafDef(d),
      ),
      ...columns.slice(allColumns.length).map(leafDef),
    ],
    getRowId: (r) => String(props.getKey(r)),
    state: {
      sorting,
      columnVisibility: Object.fromEntries(
        allColumns.map((c) => [c.accessor, isShown(c)]),
      ),
      expanded,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => Boolean(props.detail),
    // We pass a new data array every render; TanStack's default would reset
    // the open rows each time, which re-renders forever. Open rows are the
    // viewer's choice and stay until they close them.
    autoResetExpanded: false,
    enableSortingRemoval: false,
  })
  // Sorted once, then split back into the main list and the hidden section.
  const sortedRows = table.getRowModel().rows
  // Remember every row that has been open, so its panel stays mounted.
  useEffect(() => {
    const ids = sortedRows
      .filter((row) => row.getIsExpanded())
      .map((row) => row.id)
    if (ids.some((id) => !opened.has(id)))
      setOpened((o) => new Set([...o, ...ids]))
  }, [expanded]) // only when rows open or close
  const rows = [
    ...sortedRows.filter((r) => !hiddenKeys.has(props.getKey(r.original))),
    ...sortedRows.filter((r) => hiddenKeys.has(props.getKey(r.original))),
  ]
  const shownCount = result.shown.length
  const hiddenCount = result.hidden.length
  const records = rows.map((r) => r.original)

  // Keyboard stops: every row, then "Add ..." when it's offered.
  const offerAdd = q !== '' && props.addNew !== undefined
  // An active row only where Enter does something (a row action or "Add …");
  // on read-only lists a highlighted row would promise an action that isn't
  // there.
  const keyboardRows =
    Boolean(props.primaryAction) || props.addNew !== undefined
  const stops = keyboardRows ? records.length + (offerAdd ? 1 : 0) : 0
  const active =
    activeFor.query === query
      ? activeFor.index !== null && activeFor.index < stops
        ? activeFor.index
        : null
      : defaultActive(q !== '', stops)
  const rowId = (r: T) => `${idPrefix}-row-${props.getKey(r)}`
  const addId = `${idPrefix}-add`
  const gridId = `${idPrefix}-grid`
  const activeId =
    active === null
      ? undefined
      : active < records.length
        ? rowId(records[active])
        : addId

  // Browsers don't scroll an aria-activedescendant into view; do it here.
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  // Short headers (DECISIONS.md, "Column widths"): the whole table switches
  // to short titles together, and only when full titles would make it wider
  // than its box. Measured with full titles showing, so switching can't flip
  // back; checked again whenever the box resizes.
  const tableRef = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    const table = tableRef.current
    const root = table?.closest<HTMLElement>('.lt-root')
    const scroller = table?.parentElement
    if (!table || !root || !scroller) return
    const check = () => {
      root.removeAttribute('data-compact')
      if (!table.querySelector('.lt-short')) return
      root.toggleAttribute(
        'data-compact',
        table.scrollWidth > scroller.clientWidth + 1,
      )
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(scroller)
    return () => observer.disconnect()
  })

  // Marks the root while the table is scrolled sideways, so the pinned
  // column shows its edge only then.
  useEffect(() => {
    const scroller = tableRef.current?.closest<HTMLElement>(
      '.mantine-TableScrollContainer-scrollContainer',
    )
    const root = tableRef.current?.closest<HTMLElement>('.lt-root')
    if (!scroller || !root) return
    const update = () =>
      root.toggleAttribute('data-scrolled', scroller.scrollLeft > 0)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [])

  // Opening the sheet from a pill scrolls to that filter.
  useEffect(() => {
    if (!sheet.open || !sheet.at) return
    const t = setTimeout(
      () =>
        document
          .getElementById(`${idPrefix}-${sheet.at}`)
          ?.scrollIntoView({ block: 'nearest' }),
      200,
    )
    return () => clearTimeout(t)
  }, [sheet, idPrefix])

  const detailId = (r: T) => `${idPrefix}-detail-${props.getKey(r)}`
  const controlsOf = (row: Row<typeof features, T>): RowControls => ({
    expanded: row.getIsExpanded(),
    expand: () => row.toggleExpanded(true),
    collapse: () => row.toggleExpanded(false),
    toggle: () => row.toggleExpanded(),
    detailId: detailId(row.original),
  })
  const rowOf = (r: T) => rows.find((row) => row.original === r)
  const actionOf = (r: T) => {
    const row = rowOf(r)
    return row ? (props.primaryAction?.(r, controlsOf(row)) ?? null) : null
  }
  const runAction = (r: T) => {
    const action = actionOf(r)
    if (!action) return
    action.run()
    if (q && !props.keepSearchAfterAction) setQuery('')
    if (!action.keepFocus) inputRef.current?.focus()
  }
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveFor({ query, index: moveActive(active, stops, e.key) })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active === null) return
      if (active >= records.length) props.addNew?.onAdd(q)
      else runAction(records[active])
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  const renderCell = (c: ListColumn<T>, r: T, i: number): ReactNode => {
    if (c.accessor === '__actions') return props.rowActions?.(r)
    if (c.accessor === '__primary') {
      const action = actionOf(r)
      if (!action) return null
      const isActiveRow = i === active
      return (
        <Button
          size={phone ? 'sm' : 'xs'}
          // Filled on the active row: that's what Enter will run.
          variant={isActiveRow ? 'filled' : action.done ? 'light' : 'default'}
          leftSection={action.icon}
          // Expand ↔ Collapse keeps one width, so the columns don't jump.
          miw={action.expanded !== undefined ? '7.5em' : undefined}
          aria-expanded={action.expanded}
          aria-controls={
            action.expanded !== undefined ? detailId(r) : undefined
          }
          rightSection={
            isActiveRow && !phone ? (
              <Text span size="xs" aria-hidden>
                ↵
              </Text>
            ) : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            runAction(r)
          }}
        >
          {action.label}
        </Button>
      )
    }
    const cell = c.render
      ? c.render(r, i)
      : String(fieldValue(r, c.accessor) ?? '')
    if (c.accessor !== props.primaryColumn) return cell
    const also = props.searchAlso
      ? alsoMatches(props.searchAlso.texts(r), query)
      : []
    // Hidden matches say why they're hidden, in their own values, except
    // where a visible column already shows that value.
    const why = hiddenKeys.has(props.getKey(r))
      ? rejectedBy(defs, state, r, now)
          .filter(
            (d) => !d.column || !table.getColumn(d.column)?.getIsVisible(),
          )
          .map((d) => describeRecord(d, r))
          .join(' · ')
      : ''
    if (also.length === 0 && !why) return cell
    return (
      <Stack gap={0}>
        {cell}
        {also.length > 0 && props.searchAlso && (
          <AlsoLine
            label={props.searchAlso.label}
            texts={also}
            max={props.searchAlso.max ?? 3}
            query={query}
          />
        )}
        {why && (
          <Text size="xs" c="dimmed">
            {why}
          </Text>
        )}
      </Stack>
    )
  }

  const panel = (
    <FilterPanel
      ctx={ctx}
      idPrefix={idPrefix}
      setValue={setValue}
      canReset={canResetSheet}
      onReset={reset}
      onDone={closeSheet}
      doneLabel={`Show ${shownCount} ${noun(shownCount)}`}
    />
  )
  const filtersButton = (
    <Button
      variant="default"
      size={phone ? 'md' : 'sm'}
      onClick={() => (sheet.open ? closeSheet() : setSheet({ open: true }))}
      rightSection={
        count > 0 ? (
          <Badge size="sm" circle>
            {count}
          </Badge>
        ) : undefined
      }
    >
      Filters
    </Button>
  )
  const columnPanel = (
    <ColumnPanel
      items={choiceItems}
      onToggle={(keys, shown) =>
        setColChoice((p) => ({
          ...p,
          ...Object.fromEntries(keys.map((k) => [k, shown])),
        }))
      }
      canReset={colsChanged}
      onReset={() => setColChoice({})}
      onDone={() => setColsOpen(false)}
      phone={phone}
    />
  )
  // Styled like the Filters count, it says the view is narrowed: "9/16" =
  // columns shown / all columns, only while some are hidden (DECISIONS.md,
  // "Hidden columns").
  const shownColumns = allColumns.filter(isShown).length
  const columnsButton = (
    <Button
      variant="default"
      size={phone ? 'md' : 'sm'}
      onClick={() => setColsOpen((o) => !o)}
      aria-label={
        shownColumns < allColumns.length
          ? `Columns, ${shownColumns} of ${allColumns.length} shown`
          : 'Columns'
      }
      rightSection={
        shownColumns < allColumns.length ? (
          <Badge size="sm">
            {shownColumns}/{allColumns.length}
          </Badge>
        ) : undefined
      }
    >
      Columns
    </Button>
  )
  const pillSize = phone ? 'md' : 'sm'

  // The count sits in the search box, like a browser's find bar.
  const boxCount = filtered ? `${shownCount} of ${props.records.length}` : ''
  const rightWidth =
    (boxCount ? boxCount.length * 7.5 + 12 : 0) + (query ? 30 : 0)
  const anyCollapsed = rows.some((row) => !row.getIsExpanded())
  const expandAllButton = props.detail && rows.length > 0 && (
    <Button
      variant="default"
      size={phone ? 'md' : 'sm'}
      onClick={() => table.toggleAllRowsExpanded(anyCollapsed)}
    >
      {anyCollapsed ? 'Expand all' : 'Collapse all'}
    </Button>
  )
  // Filters and Columns: next to the search box on desktop; on phones they
  // start the pill row, so the search box keeps the full width.
  const controls = (
    <>
      {defs.length > 0 &&
        (phone ? (
          filtersButton
        ) : (
          <Popover
            opened={sheet.open}
            onChange={(open) => (open ? setSheet({ open }) : closeSheet())}
            position="bottom-end"
            width={360}
            shadow="md"
            trapFocus
            middlewares={FIT_SCREEN}
          >
            <Popover.Target>{filtersButton}</Popover.Target>
            <Popover.Dropdown
              style={{
                ['--lt-sheet-pad' as string]: '12px',
                ['--lt-sheet-pad-x' as string]: '16px',
              }}
            >
              {panel}
            </Popover.Dropdown>
          </Popover>
        ))}
      {expandAllButton}
      {chooser &&
        (phone ? (
          columnsButton
        ) : (
          <Popover
            opened={colsOpen}
            onChange={setColsOpen}
            position="bottom-end"
            width={280}
            shadow="md"
            trapFocus
            middlewares={FIT_SCREEN}
          >
            <Popover.Target>{columnsButton}</Popover.Target>
            <Popover.Dropdown
              style={{
                ['--lt-sheet-pad' as string]: '12px',
                ['--lt-sheet-pad-x' as string]: '16px',
              }}
            >
              {columnPanel}
            </Popover.Dropdown>
          </Popover>
        ))}
    </>
  )
  const hasControls = defs.length > 0 || chooser || Boolean(props.detail)

  const searchRow = (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <TextInput
        style={{ flex: 1 }}
        placeholder={props.searchPlaceholder ?? 'Search…'}
        leftSection={<IconSearch size={16} />}
        rightSectionPointerEvents="all"
        rightSectionWidth={rightWidth || undefined}
        rightSection={
          rightWidth > 0 && (
            <Group gap={2} wrap="nowrap" justify="flex-end" w="100%" pr={4}>
              {boxCount && (
                <Text
                  size="sm"
                  c="dimmed"
                  style={{ whiteSpace: 'nowrap' }}
                  aria-live="polite"
                  aria-label={`Showing ${shownCount} of ${props.records.length} ${noun(props.records.length)}`}
                >
                  {boxCount}
                </Text>
              )}
              {query && (
                <CloseButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                />
              )}
            </Group>
          )
        }
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={onSearchKey}
        ref={inputRef}
        aria-label="Search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={stops > 0}
        aria-controls={gridId}
        aria-activedescendant={activeId}
        enterKeyHint={props.primaryAction ? 'go' : 'search'}
        autoComplete="off"
      />
      {!phone && controls}
    </Group>
  )

  const pillsRow = (count > 0 || canReset || (phone && hasControls)) && (
    <Group gap="xs">
      {phone && controls}
      {defs.map((d) => {
        const v = state[d.id]
        if (!isActive(v)) return null
        const label = pillLabel(d, v, props.records)
        return (
          <Button.Group key={d.id}>
            <Button
              variant="light"
              size={pillSize}
              fz="sm"
              radius="xl"
              pr={6}
              onClick={() => setSheet({ open: true, at: d.id })}
            >
              {label}
            </Button>
            <Button
              variant="light"
              size={pillSize}
              radius="xl"
              px={phone ? 12 : 8}
              aria-label={`Remove filter: ${label}`}
              onClick={() => setValue(d.id, undefined)}
            >
              ✕
            </Button>
          </Button.Group>
        )
      })}
      {canReset && (
        <Button variant="subtle" size={pillSize} fz="sm" onClick={reset}>
          Reset
        </Button>
      )}
    </Group>
  )

  const visibleLeaves = table.getVisibleLeafColumns()
  const visibleColumnCount = visibleLeaves.length
  const align = (c: ListColumn<T> | undefined) => {
    const a = c?.textAlign ?? (c?.numeric ? 'right' : undefined)
    return a ? { textAlign: a } : undefined
  }
  const headerRows = table.getHeaderGroups()
  const grouped = headerRows.length > 1
  // In tables with column groups, a line between every top-level header (a
  // single column or a group): Player | Box | Ranking | Matches. Tables without
  // groups have no column lines (DECISIONS.md, "Grouped columns").
  const topId = (col: { id: string; parent?: { id: string } }) =>
    col.parent?.id ?? col.id
  const groupStarts = new Set(
    grouped
      ? visibleLeaves
          .filter(
            (col, i) => i > 0 && topId(col) !== topId(visibleLeaves[i - 1]),
          )
          .map((col) => col.id)
      : [],
  )
  const cellClass = (c: ListColumn<T> | undefined, id: string) =>
    [
      c && c.accessor === props.primaryColumn && 'lt-pin',
      groupStarts.has(id) && 'lt-gstart',
      c?.numeric && 'lt-num',
      // Only the primary column takes spare width; the rest fit their content.
      c?.accessor !== props.primaryColumn && 'lt-fit',
    ]
      .filter(Boolean)
      .join(' ') || undefined
  // Full title, or the short one when the table is compact (see the effect
  // above); screen readers always get the full title.
  const headerLabel = (c: ListColumn<T> | undefined) =>
    c?.shortTitle ? (
      <span className="lt-th-label" title={c.title}>
        <span className="lt-full">{c.title}</span>
        <span className="lt-short" aria-hidden>
          {c.shortTitle}
        </span>
      </span>
    ) : (
      c?.title
    )
  const tableEl = (
    // Native sideways scroll when the viewer adds columns on a phone.
    <Table.ScrollContainer minWidth={0} type="native">
      <Table
        ref={tableRef}
        id={gridId}
        role="grid"
        aria-label={props.noun.many}
        verticalSpacing="xs"
        highlightOnHover
      >
        <Table.Thead>
          {headerRows.map((hg, row) => (
            <Table.Tr key={hg.id}>
              {hg.headers.map((header) => {
                const isGroupHeader =
                  header.subHeaders.length > 0 && !header.isPlaceholder
                if (isGroupHeader)
                  return (
                    <Table.Th
                      key={header.id}
                      colSpan={header.colSpan}
                      className={
                        groupStarts.has(
                          header
                            .getLeafHeaders()
                            .find((h) => h.subHeaders.length === 0)?.column
                            .id ?? '',
                        )
                          ? 'lt-group-th lt-gstart'
                          : 'lt-group-th'
                      }
                    >
                      {String(header.column.columnDef.header ?? '')}
                    </Table.Th>
                  )
                // Ungrouped columns span both header rows: drawn once, in
                // the top row (where TanStack puts a placeholder).
                if (grouped && row > 0 && !header.column.parent) return null
                const c = byId.get(header.column.id)
                const dir = header.column.getIsSorted()
                return (
                  <Table.Th
                    key={header.id}
                    rowSpan={grouped && !header.column.parent ? 2 : undefined}
                    w={c?.width}
                    style={align(c)}
                    className={cellClass(c, header.column.id)}
                    aria-sort={
                      dir === 'asc'
                        ? 'ascending'
                        : dir === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {header.column.getCanSort() ? (
                      <UnstyledButton
                        onClick={header.column.getToggleSortingHandler()}
                        fw={700}
                        fz="sm"
                        style={{
                          display: 'flex',
                          width: '100%',
                          alignItems: 'center',
                          justifyContent:
                            align(c)?.textAlign === 'right'
                              ? 'flex-end'
                              : 'flex-start',
                          gap: 4,
                        }}
                      >
                        {headerLabel(c)}
                        {dir === 'asc' ? (
                          <IconArrowUp size={14} />
                        ) : dir === 'desc' ? (
                          <IconArrowDown size={14} />
                        ) : (
                          <IconSelector size={14} opacity={0.4} />
                        )}
                      </UnstyledButton>
                    ) : (
                      headerLabel(c)
                    )}
                  </Table.Th>
                )
              })}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={visibleColumnCount} py="xl" ta="center">
                <Text c="dimmed" size="sm">
                  {q ? `No one matches “${q}”` : 'No one matches the filters'}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {rows.map((row, i) => {
            const r = row.original
            const isHidden = i >= shownCount
            // Stripes restart in the hidden section.
            const n = isHidden ? i - shownCount : i
            const className = [
              isHidden && 'lt-hidden',
              n % 2 === 1 && 'lt-odd',
              i === active && 'lt-active',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <Fragment key={row.id}>
                {i === shownCount && (
                  <Table.Tr className="lt-hidden-head">
                    <Table.Td colSpan={visibleColumnCount}>
                      <Text size="sm" fw={700}>
                        {(props.hiddenHeading ?? defaultHiddenHeading)(
                          q,
                          hiddenCount,
                        )}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                <Table.Tr
                  id={rowId(r)}
                  aria-selected={i === active}
                  className={
                    [className, row.getIsExpanded() && 'lt-open']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  onClick={
                    props.onRowClick ? () => props.onRowClick!(r) : undefined
                  }
                  style={props.onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const c = byId.get(cell.column.id)
                    return (
                      <Table.Td
                        key={cell.id}
                        role="gridcell"
                        style={align(c)}
                        className={cellClass(c, cell.column.id)}
                      >
                        {c ? renderCell(c, r, i) : null}
                      </Table.Td>
                    )
                  })}
                </Table.Tr>
                {props.detail &&
                  (opened.has(row.id) || row.getIsExpanded()) && (
                    <Table.Tr
                      className="lt-detail"
                      data-open={row.getIsExpanded() || undefined}
                    >
                      <Table.Td colSpan={visibleColumnCount} id={detailId(r)}>
                        <DetailCollapse open={row.getIsExpanded()}>
                          <div className="lt-detail-body">
                            {props.detail(r, controlsOf(row))}
                          </div>
                        </DetailCollapse>
                      </Table.Td>
                    </Table.Tr>
                  )}
              </Fragment>
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )

  const showReset =
    q !== '' && shownCount === 0 && hiddenCount === 0 && canReset
  const showAdd = q !== '' && props.addNew !== undefined

  // One bordered card, with the controls as the table's header. Edge to edge
  // on phones, cancelling the page's 16px gutter.
  const radius = phone ? '0' : 'var(--mantine-radius-md)'
  const line = '1px solid var(--mantine-color-default-border)'
  const cardStyle = {
    borderTop: line,
    borderBottom: line,
    borderLeft: phone ? 'none' : line,
    borderRight: phone ? 'none' : line,
    borderRadius: radius,
  }
  const hasActions =
    props.actions !== undefined ||
    props.title !== undefined ||
    props.header !== undefined
  return (
    <Stack className="lt-root" gap={8} mx={phone ? -16 : 0}>
      {hasActions && (
        // A card of its own, styled like the table's header, a small gap
        // above it: separate, but visibly part of the same whole.
        <Group
          className="lt-actions"
          justify="space-between"
          gap="sm"
          px="sm"
          py="xs"
          mih={52}
          style={cardStyle}
        >
          {props.header !== undefined ? (
            <Box style={{ flex: 1, minWidth: 0 }}>{props.header}</Box>
          ) : (
            <>
              {typeof props.title === 'string' ? (
                <Text fw={600}>{props.title}</Text>
              ) : (
                (props.title ?? <span />)
              )}
              {props.actions && <Group gap="xs">{props.actions}</Group>}
            </>
          )}
        </Group>
      )}
      <Box
        style={{
          ...cardStyle,
          overflow: 'clip',
          // Rows scrolled into view stop below the sticky header.
          ['--lt-sticky-h' as string]: props.stickyHeader
            ? `${toolbar.height + 24 + (props.stickyTop ?? 0)}px`
            : '0px',
        }}
      >
        <Box
          ref={toolbar.ref}
          p="sm"
          className="lt-toolbar"
          style={{
            borderBottom: line,
            ...(props.stickyHeader && {
              position: 'sticky',
              top: props.stickyTop ?? 0,
              zIndex: 3,
            }),
          }}
        >
          <Stack gap="xs">
            {searchRow}
            {pillsRow}
          </Stack>
        </Box>
        {tableEl}
        {(showReset || showAdd) && (
          <Group gap="xs" p="xs" style={{ borderTop: line }}>
            {showReset && (
              <Button variant="subtle" onClick={reset}>
                Reset filters
              </Button>
            )}
            {showAdd && (
              <Button
                id={addId}
                variant={active === records.length ? 'filled' : 'subtle'}
                leftSection={<IconPlus size={16} />}
                onClick={() => props.addNew!.onAdd(q)}
              >
                {props.addNew!.label(q)}
              </Button>
            )}
          </Group>
        )}
        {phone && (
          <Drawer
            opened={sheet.open}
            onClose={closeSheet}
            position="bottom"
            title="Filters"
            size="auto"
            styles={SHEET_STYLES}
          >
            {panel}
          </Drawer>
        )}
        {phone && (
          <Drawer
            opened={colsOpen}
            onClose={() => setColsOpen(false)}
            position="bottom"
            title="Columns"
            size="auto"
            styles={SHEET_STYLES}
          >
            {columnPanel}
          </Drawer>
        )}
      </Box>
    </Stack>
  )
}

// Desktop popovers never run off screen: as tall as the space left below
// (or above) the button, scrolling inside (Floating UI's size middleware).
const FIT_SCREEN = {
  flip: true,
  shift: true,
  size: {
    padding: 16,
    apply({
      availableHeight,
      elements,
    }: {
      availableHeight: number
      elements: { floating: HTMLElement }
    }) {
      elements.floating.style.maxHeight = `${Math.max(availableHeight, 200)}px`
      elements.floating.style.overflowY = 'auto'
    },
  },
}

/** "Played: Dev Singh, Dev Patel +2 more", matched words in bold. */
function AlsoLine(props: {
  label: string
  texts: string[]
  max: number
  query: string
}) {
  const shown = props.texts.slice(0, props.max)
  const more = props.texts.length - shown.length
  return (
    <Text size="xs" c="dimmed" className="lt-also">
      {props.label}:{' '}
      {shown.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && ', '}
          {highlightParts(t, props.query).map((part, j) =>
            part.hit ? <strong key={j}>{part.text}</strong> : part.text,
          )}
        </Fragment>
      ))}
      {more > 0 && ` +${more} more`}
    </Text>
  )
}

// Opening and closing rows: visible, not slow (DECISIONS.md, "Opening a box").
export const MOTION_MS = 200

/**
 * A detail panel that slides open and closed (Mantine Collapse). It first
 * renders closed and opens on the next frame, so the very first open animates
 * too. No animation when the viewer asked their device for reduced motion.
 */
function DetailCollapse(props: { open: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpen(props.open))
    return () => cancelAnimationFrame(t)
  }, [props.open])
  return (
    <Collapse
      expanded={open}
      transitionDuration={reduce ? 0 : MOTION_MS}
      transitionTimingFunction="ease"
    >
      {props.children}
    </Collapse>
  )
}

// Bottom sheets as tall as their content, up to 85% of the screen.
const SHEET_STYLES = {
  content: {
    height: 'auto',
    maxHeight: '85dvh',
    borderRadius: '16px 16px 0 0',
  },
  // The sticky footer covers the body's bottom padding (ColumnPanel).
  body: {
    ['--lt-sheet-pad' as string]: '16px',
    ['--lt-sheet-pad-x' as string]: '16px',
  },
} as const

function defaultHiddenHeading(_query: string, count: number) {
  return `Hidden by filters (${count})`
}
