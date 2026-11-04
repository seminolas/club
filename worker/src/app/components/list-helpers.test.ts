import { describe, expect, it } from 'vitest'
import { playedDate, sessionDate } from './list-helpers'

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
