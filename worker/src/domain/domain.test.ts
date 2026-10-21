// Ported from club-next/src/domain/domain.test.ts (names and rating tests
// stay behind until those modules are ported).
import { describe, expect, it } from 'vitest'
import { boxSizeOptions, buildBoxes } from './boxes'
import { getPairings, getSitOut } from './pairings'
import { evaluateMatch, isValidSet, walkoverSets } from './scoring'
import type { SetScore } from './scoring'
import { computeStandings } from './standings'
import {
  applyAdjustments,
  applyMovement,
  cascadeTwoUpTwoDown,
  normaliseLadder,
} from './ladder'

const ALL = [4, 5, 6, 7]

describe('boxSizeOptions', () => {
  it('offers the single box of 7 only for exactly 7', () => {
    expect(boxSizeOptions(7, ALL)).toEqual([{ sizes: [7], boxCount: 1 }])
    expect(boxSizeOptions(14, ALL).some((o) => o.sizes.includes(7))).toBe(false)
  })
  it('handles 11 (not representable by 4s and 5s alone)', () => {
    expect(boxSizeOptions(11, ALL)).toEqual([{ sizes: [5, 6], boxCount: 2 }])
  })
  it('orders most boxes first with minimal spread', () => {
    const opts = boxSizeOptions(17, ALL)
    expect(opts[0]).toEqual({ sizes: [4, 4, 4, 5], boxCount: 4 })
    expect(opts.map((o) => o.boxCount)).toEqual([4, 3])
    expect(opts[1].sizes).toEqual([5, 6, 6])
  })
  it('respects allowed sizes', () => {
    expect(boxSizeOptions(12, [4]).map((o) => o.sizes)).toEqual([[4, 4, 4]])
    expect(boxSizeOptions(7, [4, 5, 6])).toEqual([])
    expect(boxSizeOptions(3, ALL)).toEqual([])
  })
  it('slices sorted attendees smallest box first', () => {
    expect(
      buildBoxes(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], [4, 5]),
    ).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h', 'i'],
    ])
  })
})

describe('pairings', () => {
  it('every player plays every other player in a box exactly as the sheets say', () => {
    for (const size of [4, 5, 6, 7]) {
      const p = getPairings(size)
      expect(p.length).toBe(
        size === 4 ? 3 : size === 5 ? 5 : size === 6 ? 6 : 7,
      )
      p.forEach((_, i) => expect(getSitOut(size, i).length).toBe(size - 4))
    }
  })
})

describe('scoring', () => {
  it('validates sets per points setting', () => {
    expect(isValidSet(21, 19, 21)).toBe(true)
    expect(isValidSet(21, 20, 21)).toBe(false)
    expect(isValidSet(21, 18, 21)).toBe(true)
    expect(isValidSet(22, 20, 21)).toBe(true)
    expect(isValidSet(30, 29, 21)).toBe(true)
    expect(isValidSet(31, 29, 21)).toBe(false)
    expect(isValidSet(15, 13, 15)).toBe(true)
    expect(isValidSet(15, 14, 15)).toBe(false)
    expect(isValidSet(16, 14, 15)).toBe(true)
    expect(isValidSet(21, 20, 15)).toBe(true)
    expect(isValidSet(15, 14, 11)).toBe(true)
    expect(isValidSet(11, 9, 11)).toBe(true)
    expect(isValidSet(21, 0, 15)).toBe(false)
  })
  it('evaluates match status', () => {
    expect(evaluateMatch([], 21).status).toBe('not_started')
    expect(evaluateMatch([[21, 10]], 21).status).toBe('in_progress')
    expect(
      evaluateMatch(
        [
          [21, 10],
          [21, 15],
        ],
        21,
      ),
    ).toMatchObject({ status: 'complete', winner: 1 })
    expect(
      evaluateMatch(
        [
          [21, 10],
          [15, 21],
          [19, 21],
        ],
        21,
      ),
    ).toMatchObject({ status: 'complete', winner: 2 })
    expect(evaluateMatch([[21, 20]], 21).status).toBe('invalid')
    expect(evaluateMatch([[21, null]], 21).status).toBe('in_progress')
  })
  it('fills walkovers after completed sets', () => {
    expect(walkoverSets([], 1, 21)).toEqual([
      [0, 21],
      [0, 21],
    ])
    expect(walkoverSets([[21, 15]], 1, 21)).toEqual([
      [21, 15],
      [0, 21],
      [0, 21],
    ])
    expect(walkoverSets([[11, 15]], 1, 15)).toEqual([
      [11, 15],
      [0, 15],
    ])
    expect(
      walkoverSets(
        [
          [21, 15],
          [null, null],
        ],
        2,
        21,
      ),
    ).toEqual([
      [21, 15],
      [21, 0],
    ])
  })
})

describe('standings', () => {
  it('ranks by games, set diff, point diff, then ladder position', () => {
    // box of 4: m0 = (0,1) v (2,3); m1 = (0,2) v (1,3); m2 = (0,3) v (1,2)
    const sets: SetScore[][] = [
      [
        [21, 10],
        [21, 10],
      ], // A,B beat C,D
      [
        [21, 18],
        [10, 21],
        [21, 18],
      ], // A,C beat B,D
      [
        [21, 15],
        [21, 15],
      ], // A,D beat B,C
    ]
    const st = computeStandings(
      { players: ['A', 'B', 'C', 'D'], matchSets: sets },
      21,
      (p) => 'ABCD'.indexOf(p),
    )
    expect(st[0]).toMatchObject({ player: 'A', gamesWon: 3, placing: 1 })
    expect(st.slice(1).every((s) => s.gamesWon === 1)).toBe(true)
    // B: sets 2-0, 1-2, 0-2 → -1; C: 0-2, 2-1, 0-2 → -1... point diff decides.
    expect(st.map((s) => s.placing)).toEqual([1, 2, 3, 4])
  })
  it('falls back to ladder position on a full tie', () => {
    const st = computeStandings(
      { players: ['A', 'B', 'C', 'D'], matchSets: [] },
      21,
      (p) => 'DCBA'.indexOf(p),
    )
    expect(st.map((s) => s.player)).toEqual(['D', 'C', 'B', 'A'])
  })
})

describe('ladder', () => {
  it('cascades 2 up 2 down', () => {
    expect(
      cascadeTwoUpTwoDown([
        ['a1', 'a2', 'a3', 'a4'],
        ['b1', 'b2', 'b3', 'b4', 'b5'],
        ['c1', 'c2', 'c3', 'c4'],
      ]),
    ).toEqual([
      'a1',
      'a2',
      'b1',
      'b2',
      'a3',
      'a4',
      'b3',
      'c1',
      'c2',
      'b4',
      'b5',
      'c3',
      'c4',
    ])
  })
  it('reshuffles attendees within their slots, absentees stay, newcomers append', () => {
    const before = ['p1', 'x', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'y']
    const boxes = [
      ['p2', 'p1', 'p3', 'p4'], // final order of box 1
      ['p8', 'p5', 'p7', 'p6'],
    ]
    const after = applyMovement(before, boxes, '2up2down', ['new'])
    expect(after).toEqual([
      'p2',
      'x',
      'p1',
      'p8',
      'p5',
      'p3',
      'p4',
      'p7',
      'p6',
      'y',
      'new',
    ])
  })
  it('applies adjustments in order', () => {
    const base = ['a', 'b', 'c']
    expect(
      applyAdjustments(base, [
        { type: 'join', person: 'd' },
        { type: 'set_position', person: 'd', position: 2 },
        { type: 'join', person: 'd' },
      ]),
    ).toEqual(['a', 'd', 'b', 'c'])
    expect(
      applyAdjustments(base, [{ type: 'import', order: ['c', 'a'] }]),
    ).toEqual(['c', 'a', 'b'])
    expect(normaliseLadder(['a', 'zz', 'b'], ['b', 'a', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
