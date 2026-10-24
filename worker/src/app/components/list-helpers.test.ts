import { describe, expect, it } from 'vitest'
import { nameLabels } from './list-helpers'

const p = (personId: number, fullName: string) => ({
  personId,
  fullName,
  displayName: fullName.split(' ')[0],
})
const TAYLOR = p(1, 'Ben Taylor')
const WRIGHT = p(2, 'Ben Wright')
const OSCAR = p(3, 'Oscar Wright')
const JOSH = p(4, 'Josh Bennett')

describe('nameLabels', () => {
  it('shows full names only for clashes in the view', () => {
    const label = nameLabels([TAYLOR, WRIGHT, OSCAR], '')
    expect([TAYLOR, WRIGHT, OSCAR].map(label)).toEqual([
      'Ben Taylor',
      'Ben Wright',
      'Oscar',
    ])
  })

  it('shows the full name when the search matched outside the short name', () => {
    expect(nameLabels([OSCAR], 'wright')(OSCAR)).toBe('Oscar Wright')
    expect(nameLabels([JOSH], 'ben')(JOSH)).toBe('Josh Bennett')
    expect(nameLabels([OSCAR], 'osc')(OSCAR)).toBe('Oscar')
  })
})
