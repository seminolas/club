import { describe, expect, it } from 'vitest'
import { legacyPath } from './legacy'

describe('legacyPath (old #/ links)', () => {
  it.each([
    ['#/players', '/seniors/players'],
    ['#/', '/seniors/players'],
    ['#/sessions', '/seniors/sessions'],
    ['#/players/30', '/seniors/players/30'],
    ['#/2026-10-20', '/seniors/sessions/2026-10-20'],
    ['#/2026-10-20/attendance', '/seniors/sessions/2026-10-20/checkin'],
    ['#/2026-10-20/games', '/seniors/sessions/2026-10-20/boxes'],
    ['#/2026-10-20/wrapup', '/seniors/sessions/2026-10-20/results'],
    ['#/session/2026-07-14', '/seniors/sessions/2026-07-14'],
    ['#/session/2026-07-14/results', '/seniors/sessions/2026-07-14/boxes'],
    [
      '#/session/2026-07-14/leaderboard',
      '/seniors/sessions/2026-07-14/results',
    ],
  ])('%s → %s', (hash, path) => expect(legacyPath(hash)).toBe(path))

  it('leaves other hashes alone', () => {
    expect(legacyPath('')).toBeNull()
    expect(legacyPath('#section')).toBeNull()
  })
})
