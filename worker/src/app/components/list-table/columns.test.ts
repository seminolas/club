import { describe, expect, it } from 'vitest'
import {
  compareValues,
  fieldValue,
  groupCheckbox,
  groupId,
  leafColumns,
  shownByDefault,
} from './columns'
import type { ListColumnDef, ListColumnGroup } from './columns'

describe('compareValues', () => {
  it('compares numbers by size and text naturally', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues('Box 2', 'Box 10')).toBeLessThan(0)
    expect(compareValues('aroha', 'Ben')).toBeLessThan(0)
  })
})

describe('fieldValue', () => {
  it('treats null like a missing value, so sorting can put both last', () => {
    expect(fieldValue({ rating: null }, 'rating')).toBeUndefined()
    expect(fieldValue({ rating: 0 }, 'rating')).toBe(0)
  })
})

type Row = { name: string }
const sets: ListColumnGroup<Row> = {
  group: 'sets',
  title: 'Sets',
  defaultHidden: true,
  columns: [{ accessor: 'st' }, { accessor: 'sw', defaultHidden: false }],
}
const ranking: ListColumnGroup<Row> = {
  group: 'ranking',
  title: 'Ranking',
  columns: [{ accessor: 'rb', visibleMediaQuery: 'wide' }, { accessor: 'rd' }],
}

describe('leafColumns', () => {
  it('flattens groups in order, remembering each column’s group', () => {
    const defs: ListColumnDef<Row>[] = [{ accessor: 'name' }, ranking, sets]
    expect(
      leafColumns(defs).map(
        (l) => `${l.group?.group ?? '-'}:${l.column.accessor}`,
      ),
    ).toEqual(['-:name', 'ranking:rb', 'ranking:rd', 'sets:st', 'sets:sw'])
  })
})

describe('shownByDefault', () => {
  const phone = (q: string) => q !== 'wide'
  it('follows the group default unless the column overrides it', () => {
    expect(shownByDefault(sets.columns[0], sets, phone)).toBe(false)
    expect(shownByDefault(sets.columns[1], sets, phone)).toBe(true)
  })
  it('applies screen-size queries', () => {
    expect(shownByDefault(ranking.columns[0], ranking, phone)).toBe(false)
    expect(shownByDefault(ranking.columns[0], ranking, () => true)).toBe(true)
    expect(shownByDefault(ranking.columns[1], ranking, phone)).toBe(true)
  })
})

describe('groupId', () => {
  it('never collides with a column of the same name', () => {
    const g: ListColumnGroup<Row> = {
      group: 'sets',
      title: 'Sets',
      columns: [{ accessor: 'sets' }],
    }
    expect(groupId(g)).not.toBe(g.columns[0].accessor)
  })
})

describe('groupCheckbox', () => {
  it('is ticked when all columns show, and then clicking hides all', () => {
    expect(groupCheckbox([true, true])).toEqual({
      checked: true,
      indeterminate: false,
      next: false,
    })
  })
  it('shows a dash when only some show, and then clicking shows all', () => {
    expect(groupCheckbox([true, false])).toEqual({
      checked: false,
      indeterminate: true,
      next: true,
    })
  })
  it('is empty when none show, and then clicking shows all', () => {
    expect(groupCheckbox([false, false])).toEqual({
      checked: false,
      indeterminate: false,
      next: true,
    })
  })
})
