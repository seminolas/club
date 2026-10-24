import { describe, expect, it } from 'vitest'
import { showThirdSet, withScore } from './scoreSheet'

describe('withScore (the live app’s setScore)', () => {
  it('fills a set one side at a time', () => {
    const a = withScore([], 0, 0, 15)
    expect(a).toEqual([[15, null]])
    expect(withScore(a, 0, 1, 9)).toEqual([[15, 9]])
  })
  it('drops trailing empty sets', () => {
    expect(
      withScore(
        [
          [15, 9],
          [3, null],
        ],
        1,
        0,
        null,
      ),
    ).toEqual([[15, 9]])
  })
  it('drops a stale third set when the first two become a sweep', () => {
    const split: [number, number][] = [
      [15, 9],
      [9, 15],
      [15, 13],
    ]
    expect(withScore(split, 1, 0, 15).length).toBe(3) // still being typed
    expect(withScore(withScore(split, 1, 0, 15), 1, 1, 9)).toEqual([
      [15, 9],
      [15, 9],
    ])
  })
})

describe('showThirdSet', () => {
  it('only when the first two sets are complete and split', () => {
    expect(
      showThirdSet([
        [15, 9],
        [9, 15],
      ]),
    ).toBe(true)
    expect(
      showThirdSet([
        [15, 9],
        [15, 9],
      ]),
    ).toBe(false)
    expect(
      showThirdSet([
        [15, 9],
        [9, null],
      ]),
    ).toBe(false)
    expect(
      showThirdSet([
        [15, 9],
        [16, 12],
      ]),
    ).toBe(false) // invalid set
  })
})
