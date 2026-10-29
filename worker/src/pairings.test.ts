import { describe, expect, it } from 'vitest'
import { scheduleBox } from './domain/pairings'
import { legacy } from './test/rules-under-test'

describe('scheduleBox', () => {
  // Guards a past bug: sizes 6/7 were added to a client-only copy of the
  // tables, so those boxes came back from the API with empty pairings. The
  // box ladder's schedule must match the old client tables, as players.
  it.each([4, 5, 6, 7])(
    'matches the old client tables for a box of %i',
    (size) => {
      const players = Array.from({ length: size }, (_, i) => `p${i}`)
      expect(scheduleBox(players)).toEqual(
        legacy
          .getPairings(size)
          .map(({ pair1, pair2 }) => [
            pair1.map((i) => players[i]),
            pair2.map((i) => players[i]),
          ]),
      )
    },
  )

  it('throws for unsupported box sizes', () => {
    expect(() => scheduleBox([1, 2, 3])).toThrow()
    expect(() => scheduleBox([1, 2, 3, 4, 5, 6, 7, 8])).toThrow()
  })
})
