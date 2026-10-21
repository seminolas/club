// Characterization tests: what the box-night rules do, as the live app relies
// on them. Written against js/algorithm.js before S1 replaced it; the
// replacement passes them unchanged apart from changes agreed in MIGRATION.md,
// which are called out where they apply.
import { describe, expect, it } from 'vitest'
import { legacy, rules } from './test/rules-under-test'
import type { Box, SetPair } from './test/rules-under-test'

const names = (n: number, prefix = 'P') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

// A box whose matches all have the given sets (pair1 score first).
function boxWith(players: string[], setsPerMatch: SetPair[][]): Box {
  const [box] = rules.buildBoxesFromLayout([players])
  box.matches.forEach((m, i) => {
    m.sets = setsPerMatch[i] ?? []
  })
  return box
}

// Every match won 21-10, 21-10 by pair1.
const pair1Sweeps = (size: number): SetPair[][] =>
  rules.getPairings(size).map(() => [
    [21, 10],
    [21, 10],
  ])

describe('pairings', () => {
  it('match the printed score sheets for boxes of 4–7', () => {
    const tables = Object.fromEntries(
      [4, 5, 6, 7].map((s) => [
        s,
        rules.getPairings(s).map((m) => [m.pair1, m.pair2]),
      ]),
    )
    expect(tables).toMatchSnapshot()
  })

  it('have one match per player for 4–7 and nothing for other sizes', () => {
    expect([4, 5, 6, 7].map((s) => rules.getPairings(s).length)).toEqual([
      3, 5, 6, 7,
    ])
    expect(rules.getPairings(3)).toEqual([])
    expect(rules.getPairings(8)).toEqual([])
  })

  it('give every player 4 matches (3 in a box of 4)', () => {
    for (const size of [4, 5, 6, 7]) {
      const counts = new Array(size).fill(0)
      for (const m of rules.getPairings(size))
        for (const p of [...m.pair1, ...m.pair2]) counts[p]++
      expect(counts).toEqual(new Array(size).fill(size === 4 ? 3 : 4))
    }
  })

  it('start unscored, and each call returns fresh matches', () => {
    const a = rules.getPairings(4)
    expect(a.every((m) => Array.isArray(m.sets) && m.sets.length === 0)).toBe(
      true,
    )
    a[0].sets.push([21, 0])
    expect(rules.getPairings(4)[0].sets).toEqual([])
  })
})

describe('sit-outs', () => {
  it('nobody sits out in a box of 4; 1, 2, 3 per match in boxes of 5, 6, 7', () => {
    for (const [size, out] of [
      [4, 0],
      [5, 1],
      [6, 2],
      [7, 3],
    ]) {
      const box = rules.buildBoxesFromLayout([names(size)])[0]
      box.matches.forEach((_, i) =>
        expect(rules.getSitout(box, i)).toHaveLength(out),
      )
    }
  })

  it('are everyone not in the match', () => {
    const box = rules.buildBoxesFromLayout([names(6)])[0]
    expect(box.matches.map((_, i) => rules.getSitout(box, i))).toMatchSnapshot()
  })

  it('are empty for a match index that does not exist', () => {
    const box = rules.buildBoxesFromLayout([names(5)])[0]
    expect(rules.getSitout(box, 99)).toEqual([])
  })
})

describe('box size options', () => {
  it('offer only a single box of 7 for exactly 7 attendees', () => {
    expect(rules.boxSizeOptions(7)).toEqual([{ sizes: [7], boxCount: 1 }])
  })

  it('never offer a box of 7 otherwise', () => {
    for (let n = 0; n <= 80; n++)
      if (n !== 7) {
        expect(rules.boxSizeOptions(n).flatMap((o) => o.sizes)).not.toContain(7)
      }
  })

  it('resolve 11 attendees as a 5 and a 6', () => {
    expect(rules.boxSizeOptions(11)).toEqual([{ sizes: [5, 6], boxCount: 2 }])
  })

  it('list most boxes first, smallest boxes first within an option', () => {
    expect(rules.boxSizeOptions(12)).toEqual([
      { sizes: [4, 4, 4], boxCount: 3 },
      { sizes: [6, 6], boxCount: 2 },
    ])
    for (let n = 0; n <= 80; n++) {
      const opts = rules.boxSizeOptions(n)
      for (let i = 1; i < opts.length; i++)
        expect(opts[i - 1].boxCount).toBeGreaterThanOrEqual(opts[i].boxCount)
      for (const o of opts) {
        expect(o.sizes).toEqual([...o.sizes].sort((a, b) => a - b))
        expect(o.sizes.reduce((a, b) => a + b, 0)).toBe(n)
        expect(o.boxCount).toBe(o.sizes.length)
      }
    }
  })

  it('offer nothing below 4 attendees', () => {
    for (const n of [0, 1, 2, 3]) expect(rules.boxSizeOptions(n)).toEqual([])
  })

  it('match the recorded options for 0–80 attendees, in order', () => {
    const all = Array.from(
      { length: 81 },
      (_, n) =>
        `${n}: ${rules
          .boxSizeOptions(n)
          .map((o) => o.sizes.join('+'))
          .join(' | ')}`,
    )
    expect(all).toMatchSnapshot()
  })
})

describe('building boxes', () => {
  it('slice ranked attendees into the chosen sizes, top box first', () => {
    expect(rules.splitBySizes(names(9), [4, 5])).toEqual([
      names(4),
      names(9).slice(4),
    ])
  })

  it('turn a layout into unscored boxes with that size’s pairings', () => {
    const boxes = rules.buildBoxesFromLayout([names(4), names(5, 'Q')])
    expect(boxes.map((b) => b.players)).toEqual([names(4), names(5, 'Q')])
    expect(boxes.map((b) => b.matches.length)).toEqual([3, 5])
    expect(boxes[0].finalPlacings).toBeNull()
    expect(boxes[1].matches.map((m) => [m.pair1, m.pair2])).toEqual(
      rules.getPairings(5).map((m) => [m.pair1, m.pair2]),
    )
  })

  it('copy the layout rather than sharing it', () => {
    const layout = [names(4)]
    const [box] = rules.buildBoxesFromLayout(layout)
    box.players.push('X')
    expect(layout[0]).toHaveLength(4)
  })
})

describe('custom box layouts', () => {
  const byDisplay = new Map(names(9).map((n) => [`d${n}`, n]))
  const parse = (text: string) => rules.parseBoxLayout(text, byDisplay)

  it('accept every attendee placed once in boxes of 4–7', () => {
    expect(parse('dP1, dP2, dP3, dP4\ndP5,dP6,dP7,dP8,dP9')).toEqual({
      layout: [names(4), names(9).slice(4)],
      errors: [],
    })
  })

  it('ignore blank lines, spaces and stray commas', () => {
    expect(
      parse('\n  dP1 ,dP2,, dP3, dP4,  \n\n dP5, dP6, dP7, dP8, dP9\n').errors,
    ).toEqual([])
  })

  it('allow a box of 7 and keep the typed order', () => {
    const map = new Map(names(7).map((n) => [n, n]))
    expect(rules.parseBoxLayout('P7, P1, P2, P3, P4, P5, P6', map)).toEqual({
      layout: [['P7', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']],
      errors: [],
    })
  })

  it('report each problem with the box it is in', () => {
    expect(
      parse('dP1, dP2, dP3, Nobody\ndP4, dP5, dP6, dP1, dP7, dP8').errors,
    ).toEqual([
      'Box 1: unknown player "Nobody"',
      'Box 1 has 3 players (must be 4–7)',
      'Box 2: "dP1" is already in a box',
      'Not in any box: dP9',
    ])
  })

  it('reject boxes outside 4–7, with singular/plural wording', () => {
    const map = new Map(names(9).map((n) => [n, n]))
    expect(
      rules.parseBoxLayout('P1\nP2, P3, P4, P5, P6, P7, P8, P9', map).errors,
    ).toEqual([
      'Box 1 has 1 player (must be 4–7)',
      'Box 2 has 8 players (must be 4–7)',
    ])
  })

  it('reject full names when the display name differs (no guessing)', () => {
    expect(parse('P1, dP2, dP3, dP4\ndP5, dP6, dP7, dP8, dP9').errors).toEqual([
      'Box 1: unknown player "P1"',
      'Box 1 has 3 players (must be 4–7)',
      'Not in any box: dP1',
    ])
  })

  it('reject empty input', () => {
    expect(parse('  \n ').errors).toEqual([
      'Not in any box: ' + [...byDisplay.keys()].join(', '),
      'No boxes entered',
    ])
  })
})

describe('set scores', () => {
  it('accept 21-point sets (deuce from 20-all, capped at 30)', () => {
    for (const [a, b] of [
      [21, 0],
      [21, 19],
      [22, 20],
      [28, 26],
      [30, 28],
      [30, 29],
      [0, 21],
      [29, 30],
    ]) {
      expect(rules.isValidSet(a, b), `${a}-${b}`).toBe(true)
    }
    for (const [a, b] of [
      [22, 19],
      [23, 20],
      [31, 29],
      [30, 27],
      [25, 21],
      [24, 19],
    ]) {
      expect(rules.isValidSet(a, b), `${a}-${b}`).toBe(false)
    }
  })

  it('accept 15-point sets (deuce from 14-all, capped at 21)', () => {
    // 21-20 is valid: a 15-point set at the 21 cap (sudden death at 20-all).
    for (const [a, b] of [
      [15, 0],
      [15, 13],
      [16, 14],
      [20, 18],
      [21, 19],
      [21, 20],
    ]) {
      expect(rules.isValidSet(a, b), `${a}-${b}`).toBe(true)
    }
  })

  it('accept 11-point sets (deuce from 10-all, capped at 15)', () => {
    for (const [a, b] of [
      [11, 0],
      [11, 9],
      [12, 10],
      [14, 12],
      [15, 14],
    ]) {
      expect(rules.isValidSet(a, b), `${a}-${b}`).toBe(true)
    }
    expect(rules.isValidSet(11, 10)).toBe(false)
  })

  it('accept any of the three formats in the same session', () => {
    expect(
      rules.isValidSet(21, 5) &&
        rules.isValidSet(15, 5) &&
        rules.isValidSet(11, 5),
    ).toBe(true)
  })

  it('reject ties, negatives, fractions and non-numbers', () => {
    for (const [a, b] of [
      [21, 21],
      [0, 0],
      [-1, 21],
      [21, -1],
      [21.5, 10],
      ['x', 21],
      [NaN, 21],
      [Infinity, 0],
    ] as const) {
      expect(rules.isValidSet(a, b), `${a}-${b}`).toBe(false)
    }
  })

  it('take numbers typed as strings', () => {
    expect(rules.isValidSet('21', '19')).toBe(true)
    expect(rules.isValidSet('22', '19')).toBe(false)
  })

  it('match the recorded validity grid for every score 0–32 × 0–32', () => {
    const grid: string[] = []
    for (let a = 0; a <= 32; a++) {
      let row = ''
      for (let b = 0; b <= 32; b++) row += rules.isValidSet(a, b) ? '#' : '.'
      grid.push(row)
    }
    expect(grid).toMatchSnapshot()
  })

  it('count a set as complete only when both scores are in and valid', () => {
    expect(rules.isSetComplete(21, 10)).toBe(true)
    expect(rules.isSetComplete('', 10)).toBe(false)
    expect(rules.isSetComplete(21, null)).toBe(false)
    expect(rules.isSetComplete(undefined as unknown as null, 10)).toBe(false)
    expect(rules.isSetComplete(22, 19)).toBe(false)
  })
})

describe('match status', () => {
  const status = (sets?: SetPair[]) => rules.getMatchStatus({ sets })

  it('is not started with no scores', () => {
    expect(status()).toBe('not_started')
    expect(status([])).toBe('not_started')
    expect(
      status([
        ['', ''],
        [null, null],
      ]),
    ).toBe('not_started')
  })

  it('is in progress with a half-entered set or no winner yet', () => {
    expect(status([[21, '']])).toBe('in_progress')
    expect(status([[21, 10]])).toBe('in_progress')
    expect(
      status([
        [21, 10],
        [10, 21],
      ]),
    ).toBe('in_progress')
    expect(
      status([
        [21, 10],
        [21, 10],
        [5, ''],
      ]),
    ).toBe('in_progress')
  })

  it('is invalid when a fully entered set is impossible', () => {
    expect(status([[22, 19]])).toBe('invalid')
    expect(
      status([
        [21, 10],
        [22, 19],
      ]),
    ).toBe('invalid')
    expect(
      status([
        [21, 10],
        [21, 10],
        [21, 21],
      ]),
    ).toBe('invalid')
  })

  it('is in progress, not invalid, when a half-entered set follows an invalid one', () => {
    expect(
      status([
        [22, 19],
        [5, ''],
      ]),
    ).toBe('in_progress')
    expect(
      status([
        [5, ''],
        [22, 19],
      ]),
    ).toBe('in_progress')
  })

  it('is complete once a pair has won two valid sets', () => {
    expect(
      status([
        [21, 10],
        [21, 10],
      ]),
    ).toBe('complete')
    expect(
      status([
        [10, 21],
        [21, 10],
        [15, 21],
      ]),
    ).toBe('complete')
    expect(
      status([
        [11, 5],
        [15, 13],
        [21, 19],
      ]),
    ).toBe('complete')
    expect(
      status([
        [21, 10],
        [21, 10],
        [21, 10],
      ]),
    ).toBe('complete')
    expect(
      status([
        ['21', '10'],
        ['21', '10'],
      ]),
    ).toBe('complete')
    expect(
      status([
        ['', ''],
        [21, 10],
        [21, 10],
      ]),
    ).toBe('complete')
  })

  it('makes a session closable only when every match in every box is complete', () => {
    const done = boxWith(names(4), pair1Sweeps(4))
    const notDone = boxWith(names(5), pair1Sweeps(5).slice(0, 4))
    expect(rules.allScoresComplete([done])).toBe(true)
    expect(rules.allScoresComplete([done, notDone])).toBe(false)
    expect(rules.allScoresComplete([])).toBe(true)
  })
})

describe('box standings (finished games)', () => {
  it('rank by games won', () => {
    // Box of 4, pair1 sweeps every match: P1 is in pair1 three times, the
    // others once each; their tie falls through to ladder position.
    const box = boxWith(names(4), pair1Sweeps(4))
    const st = rules.computeBoxStandings(box, names(4))
    expect(st.map((s) => [s.name, s.matchesWon, s.placing])).toEqual([
      ['P1', 3, 1],
      ['P2', 1, 2],
      ['P3', 1, 3],
      ['P4', 1, 4],
    ])
  })

  it('report per-player totals with the old field names', () => {
    const box = boxWith(names(4), pair1Sweeps(4))
    const p1 = rules
      .computeBoxStandings(box, names(4))
      .find((s) => s.name === 'P1')!
    expect(p1).toMatchObject({
      playerIdx: 0,
      matchesWon: 3,
      setsWon: 6,
      setsLost: 0,
      pointsFor: 126,
      pointsAgainst: 60,
      placing: 1,
    })
  })

  it('break ties on set difference, then point difference, then ladder position', () => {
    // Every match goes 2-1 to pair1, but with different margins.
    const sets: SetPair[][] = [
      [
        [21, 19],
        [19, 21],
        [21, 19],
      ],
      [
        [21, 0],
        [0, 21],
        [21, 0],
      ],
      [
        [21, 10],
        [10, 21],
        [21, 10],
      ],
    ]
    const st = rules.computeBoxStandings(boxWith(names(4), sets), names(4))
    expect(st.map((s) => s.name)).toMatchSnapshot()
  })

  it('fall back to ladder position on a full tie, better rank first', () => {
    // Nobody has played: all level, so ladder order decides.
    const box = boxWith(['A', 'B', 'C', 'D'], [])
    expect(
      rules.computeBoxStandings(box, ['D', 'C', 'B', 'A']).map((s) => s.name),
    ).toEqual(['D', 'C', 'B', 'A'])
  })

  it('fall back to box position when there is no ladder', () => {
    const box = boxWith(['A', 'B', 'C', 'D'], [])
    expect(rules.computeBoxStandings(box, null).map((s) => s.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ])
  })

  it('match the recorded standings for complete boxes of every size', () => {
    const out: Record<number, unknown> = {}
    for (const size of [4, 5, 6, 7]) {
      // Deterministic varied results: alternate winners, margins and three-setters.
      const sets = rules.getPairings(size).map((_, i): SetPair[] =>
        i % 3 === 0
          ? [
              [21, 10 + i],
              [21, 5],
            ]
          : i % 3 === 1
            ? [
                [15, 21],
                [21, 17],
                [11, 21],
              ]
            : [
                [30, 29],
                [19, 21],
                [22, 20],
              ],
      )
      out[size] = rules
        .computeBoxStandings(boxWith(names(size), sets), names(size).reverse())
        .map(
          (s) =>
            `${s.placing}. ${s.name} W${s.matchesWon} S${s.setsWon}-${s.setsLost} P${s.pointsFor}-${s.pointsAgainst}`,
        )
    }
    expect(out).toMatchSnapshot()
  })
})

describe('box standings (games still being played)', () => {
  // Changed in S1 (MIGRATION.md, decision B). Before: a 1–0 lead counted as a
  // win, and points from invalid sets counted.
  it('count a game as won only once it is finished', () => {
    const box = boxWith(names(4), [[[21, 10]]])
    const p1 = rules
      .computeBoxStandings(box, names(4))
      .find((s) => s.name === 'P1')!
    expect([p1.matchesWon, p1.setsWon, p1.pointsFor]).toEqual([0, 1, 21])
    expect(
      legacy.computeBoxStandings(box, names(4)).find((s) => s.name === 'P1')!
        .matchesWon,
    ).toBe(1)
  })

  it('ignore a game with an invalid score until it is fixed', () => {
    const box = boxWith(names(4), [
      [
        [21, 10],
        [22, 19],
      ],
    ])
    const p1 = rules
      .computeBoxStandings(box, names(4))
      .find((s) => s.name === 'P1')!
    expect([p1.pointsFor, p1.pointsAgainst, p1.setsWon]).toEqual([0, 0, 0])
  })

  it('skip half-entered sets', () => {
    const box = boxWith(names(4), [
      [
        [21, 10],
        [5, ''],
      ],
    ])
    const p1 = rules
      .computeBoxStandings(box, names(4))
      .find((s) => s.name === 'P1')!
    expect([p1.pointsFor, p1.setsWon]).toEqual([21, 1])
  })
})

describe('2 up, 2 down', () => {
  it('swap the bottom 2 of each box with the top 2 of the box below', () => {
    expect(
      rules.buildAttendeeOrder([
        ['a1', 'a2', 'a3', 'a4'],
        ['b1', 'b2', 'b3', 'b4'],
      ]),
    ).toEqual(['a1', 'a2', 'b1', 'b2', 'a3', 'a4', 'b3', 'b4'])
  })

  it('keep the middle of bigger boxes in place', () => {
    expect(
      rules.buildAttendeeOrder([names(5, 'a'), names(6, 'b'), names(4, 'c')]),
    ).toEqual([
      'a1',
      'a2',
      'a3',
      'b1',
      'b2',
      'a4',
      'a5',
      'b3',
      'b4',
      'c1',
      'c2',
      'b5',
      'b6',
      'c3',
      'c4',
    ])
  })

  it('leave a single box unchanged', () => {
    expect(rules.buildAttendeeOrder([names(5)])).toEqual(names(5))
    expect(rules.buildAttendeeOrder([])).toEqual([])
  })

  it('match the recorded order for mixes of box sizes', () => {
    const mixes = [
      [4],
      [7],
      [4, 4],
      [4, 5],
      [5, 6],
      [6, 6],
      [4, 4, 4],
      [4, 5, 6],
      [5, 5, 6, 6],
      [4, 4, 5, 5, 6, 6],
    ]
    expect(
      Object.fromEntries(
        mixes.map((m) => [
          m.join('+'),
          rules
            .buildAttendeeOrder(
              m.map((s, i) => names(s, String.fromCharCode(97 + i))),
            )
            .join(' '),
        ]),
      ),
    ).toMatchSnapshot()
  })
})

describe('closing a session (new ladder)', () => {
  it('reshuffle attendees within the ladder slots they held; absentees keep their places', () => {
    const ladder = [
      'A1',
      'x1',
      'A2',
      'A3',
      'x2',
      'A4',
      'B1',
      'B2',
      'x3',
      'B3',
      'B4',
    ]
    const boxes = [
      boxWith(['A1', 'A2', 'A3', 'A4'], pair1Sweeps(4)),
      boxWith(['B1', 'B2', 'B3', 'B4'], pair1Sweeps(4)),
    ]
    // Standings: A1 A2 A3 A4 / B1 B2 B3 B4 → order A1 A2 B1 B2 A3 A4 B3 B4.
    expect(rules.applyLeaderboardUpdate(boxes, ladder)).toEqual([
      'A1',
      'x1',
      'A2',
      'B1',
      'x2',
      'B2',
      'A3',
      'A4',
      'x3',
      'B3',
      'B4',
    ])
  })

  it('use the finished standings, not box order', () => {
    const ladder = names(8)
    // Top box: pair2 wins everything → P4 first, P1 last.
    const top = boxWith(
      names(4),
      rules.getPairings(4).map(() => [
        [10, 21],
        [10, 21],
      ]),
    )
    const bottom = boxWith(names(8).slice(4), pair1Sweeps(4))
    expect(
      rules.applyLeaderboardUpdate([top, bottom], ladder),
    ).toMatchSnapshot()
  })

  it('do not change anything when everyone is in one box that finishes in ladder order', () => {
    const ladder = names(6)
    expect(
      rules.applyLeaderboardUpdate([boxWith(names(4), pair1Sweeps(4))], ladder),
    ).toEqual(ladder)
  })
})

describe('dates', () => {
  it('find the next Tuesday (today if it is Tuesday), as a local date', () => {
    expect(rules.nextTuesday('2026-10-20T12:00:00')).toBe('2026-10-20')
    expect(rules.nextTuesday('2026-10-21T12:00:00')).toBe('2026-10-27')
    expect(rules.nextTuesday('2026-10-19T23:30:00')).toBe('2026-10-20')
    expect(rules.nextTuesday('2026-12-30T12:00:00')).toBe('2027-01-05')
  })

  it('format a session date for display', () => {
    expect(rules.formatDate('2026-10-20')).toMatchSnapshot()
  })
})
