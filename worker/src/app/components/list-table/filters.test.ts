import { describe, expect, it } from 'vitest'
import {
  activeCount,
  alsoMatches,
  applyFilters,
  countWith,
  describeRecord,
  highlightParts,
  matchesSearch,
  periodStart,
  pillLabel,
  rejectedBy,
  sameState,
} from './filters'
import type { FilterContext, FilterDef, FilterState } from './filters'

interface P {
  name: string
  box: number
  hc: boolean
  last: string | null
}

const NOW = new Date('2026-10-22T09:00:00Z').getTime()
const ago = (days: number) => new Date(NOW - days * 864e5).toISOString()

const ROWS: P[] = [
  { name: 'Grace Kim', box: 1, hc: true, last: ago(10) },
  { name: 'Grace Ward', box: 2, hc: true, last: ago(900) },
  { name: 'Grace Tupou', box: 2, hc: false, last: null },
  { name: 'Hannah Müller', box: 4, hc: true, last: ago(40) },
  { name: 'Ben Taylor', box: 3, hc: false, last: ago(5) },
]

const box: FilterDef<P> = {
  kind: 'options',
  id: 'box',
  label: 'Box',
  multiple: true,
  options: [1, 2, 3, 4].map((n) => ({
    value: String(n),
    label: `Box ${n}`,
    short: String(n),
    test: (r: P) => r.box === n,
  })),
}
const hc: FilterDef<P> = {
  kind: 'options',
  id: 'hc',
  label: 'HelloClub',
  options: [
    {
      value: 'y',
      label: 'Linked',
      pill: 'HelloClub: linked',
      test: (r) => r.hc,
    },
    { value: 'n', label: 'Not linked', test: (r) => !r.hc },
  ],
}
const played: FilterDef<P> = {
  kind: 'within',
  id: 'played',
  label: 'Last played',
  date: (r) => r.last,
}
const DEFS = [box, hc, played]

function ctx(state: FilterState, query = ''): FilterContext<P> {
  return {
    records: ROWS,
    defs: DEFS,
    state,
    searchText: (r) => r.name,
    query,
    now: NOW,
  }
}
const names = (rows: P[]) => rows.map((r) => r.name)

describe('applyFilters', () => {
  it('ORs options within a filter and ANDs across filters', () => {
    const { shown } = applyFilters(ctx({ box: ['2', '4'], hc: ['y'] }))
    expect(names(shown)).toEqual(['Grace Ward', 'Hannah Müller'])
  })

  it('treats an empty selection as no filter', () => {
    expect(applyFilters(ctx({ box: [] })).shown).toHaveLength(ROWS.length)
  })

  it('splits search matches into shown and hidden-by-filters', () => {
    const r = applyFilters(ctx({ played: { n: 6, unit: 'month' } }, 'grace'))
    expect(names(r.shown)).toEqual(['Grace Kim'])
    expect(names(r.hidden)).toEqual(['Grace Ward', 'Grace Tupou'])
  })

  it('only reports hidden rows while searching', () => {
    expect(applyFilters(ctx({ hc: ['y'] })).hidden).toEqual([])
  })

  it('never matches a missing date in a within filter', () => {
    const { shown } = applyFilters(ctx({ played: { n: 50, unit: 'year' } }))
    expect(names(shown)).not.toContain('Grace Tupou')
  })
})

describe('matchesSearch', () => {
  it('ignores case and accents and matches every word', () => {
    expect(matchesSearch('Hannah Müller', 'muller')).toBe(true)
    expect(matchesSearch('Hannah Müller', 'han mul')).toBe(true)
    expect(matchesSearch('Hannah Müller', 'han kim')).toBe(false)
  })
})

describe('periodStart', () => {
  it('counts back in the given unit', () => {
    const now = new Date(2026, 9, 22).getTime()
    expect(new Date(periodStart({ n: 6, unit: 'month' }, now))).toEqual(
      new Date(2026, 3, 22),
    )
    expect(new Date(periodStart({ n: 2, unit: 'week' }, now))).toEqual(
      new Date(2026, 9, 8),
    )
    expect(new Date(periodStart({ n: 1, unit: 'year' }, now))).toEqual(
      new Date(2025, 9, 22),
    )
  })
})

describe('countWith', () => {
  it('counts an option against the other filters only', () => {
    const c = ctx({ box: ['1'], hc: ['y'] })
    expect(countWith(c, 'box', ['2'])).toBe(1)
    expect(countWith(c, 'hc', undefined)).toBe(1)
  })
})

describe('rejectedBy', () => {
  it('names the filters that hide a row', () => {
    const state = { hc: ['y'], played: { n: 1, unit: 'month' } } as FilterState
    expect(rejectedBy(DEFS, state, ROWS[2], NOW).map((d) => d.label)).toEqual([
      'HelloClub',
      'Last played',
    ])
  })
})

describe('describeRecord', () => {
  it('shows the row’s own value for the filter that hides it', () => {
    expect(describeRecord(played, ROWS[2])).toBe('Last played: never')
    expect(describeRecord(played, ROWS[1])).toMatch(/^Last played: \w+ 2024$/)
    expect(describeRecord(hc, ROWS[0])).toBe('HelloClub: linked')
    expect(describeRecord(hc, ROWS[2])).toBe('HelloClub: Not linked')
  })
})

describe('pillLabel', () => {
  it('uses the option pill text for a single pick', () => {
    expect(pillLabel(hc, ['y'])).toBe('HelloClub: linked')
    expect(pillLabel(hc, ['n'])).toBe('HelloClub: Not linked')
  })
  it('lists several picks', () => {
    expect(pillLabel(box, ['2', '4'])).toBe('Box: 2, 4')
  })
  it('describes a period', () => {
    expect(pillLabel(played, { n: 1, unit: 'month' })).toBe(
      'Last played: within 1 month',
    )
    expect(pillLabel(played, { n: 3, unit: 'year' })).toBe(
      'Last played: within 3 years',
    )
  })
})

describe('sameState / activeCount', () => {
  it('ignores inactive filters and selection order', () => {
    expect(sameState({ box: ['4', '2'], hc: [] }, { box: ['2', '4'] })).toBe(
      true,
    )
    expect(sameState({ box: ['2'] }, {})).toBe(false)
    expect(activeCount({ box: [], hc: ['y'], played: undefined })).toBe(1)
  })
})

describe('pick filter (a subset from a long list)', () => {
  const players: FilterDef<P> = {
    kind: 'pick',
    id: 'players',
    label: 'Players',
    value: (r) => r.name,
    name: (r) => r.name.split(' ')[0],
  }
  it('keeps only the picked records; nothing picked means no filter', () => {
    const c = {
      ...ctx({ players: ['Grace Kim', 'Ben Taylor'] }),
      defs: [players],
    }
    expect(names(applyFilters(c).shown)).toEqual(['Grace Kim', 'Ben Taylor'])
    const none = { ...ctx({ players: [] }), defs: [players] }
    expect(applyFilters(none).shown).toHaveLength(ROWS.length)
  })
  it('names the picks in the pill, two then "+N"', () => {
    expect(pillLabel(players, ['Grace Kim'], ROWS)).toBe('Players: Grace')
    expect(
      pillLabel(players, ['Grace Kim', 'Ben Taylor', 'Grace Ward'], ROWS),
    ).toBe('Players: Grace, Ben +1')
  })
  it('says why a hidden match is hidden', () => {
    expect(describeRecord(players, ROWS[0])).toBe('Not in players picked')
  })
})

describe('search with several texts per record', () => {
  it('matches when one text has every word, not words spread across texts', () => {
    const boxes = [
      { names: ['Dev Patel', 'Ben Taylor'] },
      { names: ['Dev Singh', 'Ana Lee'] },
    ]
    const c = {
      records: boxes,
      defs: [],
      state: {},
      searchText: (b: { names: string[] }) => b.names,
      query: 'dev s',
      now: NOW,
    }
    expect(applyFilters(c).shown).toEqual([boxes[1]])
  })
})

describe('searchAlso', () => {
  interface S {
    night: string
    players: string[]
  }
  const sessions: S[] = [
    { night: 'Tuesday Seniors', players: ['Dev Singh', 'Dev Patel', 'Ema'] },
    { night: 'Friday Social', players: ['Dev Patel', 'Hemi'] },
    { night: 'Friday Social', players: ['Aroha'] },
  ]
  const run = (query: string, state: FilterState = {}) =>
    applyFilters<S>({
      records: sessions,
      defs: [
        {
          kind: 'options',
          id: 'night',
          label: 'Night',
          options: [
            { value: 'tue', label: 'Tuesday', test: (s) => s.night[0] === 'T' },
          ],
        },
      ],
      state,
      searchText: (s) => s.night,
      searchAlso: (s) => s.players,
      query,
      now: NOW,
    })

  it('finds records by texts no column shows', () => {
    expect(run('hemi').shown).toEqual([sessions[1]])
    expect(run('dev').shown).toEqual([sessions[0], sessions[1]])
  })
  it('one text must have every word', () => {
    expect(run('dev s').shown).toEqual([sessions[0]])
    // "dev" and "hemi" are in the same session, but not in one name.
    expect(run('dev hemi').shown).toEqual([])
  })
  it('still matches the main text', () => {
    expect(run('friday').shown).toEqual([sessions[1], sessions[2]])
  })
  it('a filter still hides them, as hidden matches', () => {
    const r = run('hemi', { night: ['tue'] })
    expect(r.shown).toEqual([])
    expect(r.hidden).toEqual([sessions[1]])
  })
  it('lists the texts that matched, none while not searching', () => {
    expect(alsoMatches(sessions[0].players, 'dev')).toEqual([
      'Dev Singh',
      'Dev Patel',
    ])
    expect(alsoMatches(sessions[0].players, ' ')).toEqual([])
  })
})

describe('highlightParts', () => {
  it('marks every search word, ignoring case', () => {
    expect(highlightParts('Dev Singh', 'dev s')).toEqual([
      { text: 'Dev', hit: true },
      { text: ' ', hit: false },
      { text: 'S', hit: true },
      { text: 'ingh', hit: false },
    ])
  })
  it('ignores accents, keeping the original letters', () => {
    expect(highlightParts('Hannah Müller', 'mull')).toEqual([
      { text: 'Hannah ', hit: false },
      { text: 'Müll', hit: true },
      { text: 'er', hit: false },
    ])
  })
  it('no search, nothing marked', () => {
    expect(highlightParts('Ema', '')).toEqual([{ text: 'Ema', hit: false }])
  })
})
