import { describe, expect, it } from 'vitest'
import { legacyPath } from './legacy'

describe('legacyPath (old #/ links)', () => {
  it.each([
    ['#/players', '/players'],
    ['#/', '/players'],
    ['#/sessions', '/sessions'],
    ['#/players/30', '/players/30'],
    ['#/2026-10-20', '/sessions/2026-10-20'],
    ['#/2026-10-20/attendance', '/sessions/2026-10-20/checkin'],
    ['#/2026-10-20/games', '/sessions/2026-10-20/boxes'],
    ['#/2026-10-20/wrapup', '/sessions/2026-10-20/results'],
    ['#/session/2026-07-14', '/sessions/2026-07-14'],
    ['#/session/2026-07-14/results', '/sessions/2026-07-14/boxes'],
    ['#/session/2026-07-14/leaderboard', '/sessions/2026-07-14/results'],
  ])('%s → %s', (hash, path) => expect(legacyPath(hash)).toBe(path))

  it('leaves other hashes alone', () => {
    expect(legacyPath('')).toBeNull()
    expect(legacyPath('#section')).toBeNull()
  })
})
