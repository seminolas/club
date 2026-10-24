import { describe, expect, it } from 'vitest'
import { nameLabels, playedDate, sessionDate } from './list-helpers'

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

describe('dates on the server', () => {
  it('stay on the NZ day when the code runs on UTC (SSR)', () => {
    const tz = process.env.TZ
    process.env.TZ = 'UTC'
    try {
      const now = new Date('2026-10-24T00:00:00Z').getTime()
      expect(sessionDate('2026-10-20', now)).toBe('Tue 20 Oct')
      expect(playedDate('2026-10-20', now)).toBe('20 Oct')
      expect(sessionDate('2025-10-14', now)).toBe('Tue 14 Oct 2025')
    } finally {
      process.env.TZ = tz
    }
  })
})
