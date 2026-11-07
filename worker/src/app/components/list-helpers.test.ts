import { describe, expect, it } from 'vitest'
import {
  markedTime,
  playedDate,
  playedDefault,
  sessionDate,
} from './list-helpers'

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

describe('markedTime', () => {
  // 2026-11-03 08:00 UTC = Tue 3 Nov, 9:00pm NZDT.
  const now = new Date('2026-11-03T08:00:00Z').getTime()
  it('shows the time today, the weekday within the week, else the date', () => {
    expect(markedTime('2026-11-03 06:42:00', now)).toBe('7:42pm')
    expect(markedTime('2026-11-01 02:05:00', now)).toBe('Sun 3:05pm')
    expect(markedTime('2026-10-20 06:00:00', now)).toBe('20 Oct')
  })
})

describe('the people lists’ default filter', () => {
  const now = Date.parse('2026-11-06T00:00:00Z')
  it('is "played within 3 months" once the club has 3 months of sessions', () => {
    expect(
      playedDefault([{ date: '2026-11-03' }, { date: '2026-06-09' }], now),
    ).toEqual({ played: { n: 3, unit: 'month' } })
    expect(playedDefault([{ date: '2026-08-06' }], now)).toEqual({
      played: { n: 3, unit: 'month' },
    })
  })

  it('is off for a newer club, or one with no sessions yet', () => {
    expect(playedDefault([{ date: '2026-08-07' }], now)).toEqual({})
    expect(playedDefault([], now)).toEqual({})
  })
})
