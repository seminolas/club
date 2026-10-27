import { describe, expect, it } from 'vitest'
import { fitSkill } from './skill'
import type { SkillGame } from './skill'

// A made-up club with known strengths: every doubles combination of 8 players
// plays one game to 21 per "night", with the score the model expects (the
// winner gets 21, the loser the share-matching points).
const TRUE = [0.6, 0.4, 0.3, 0.1, 0, -0.1, -0.3, -0.5]
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
function scored(a: number[], b: number[], day: number): SkillGame {
  const share = sigmoid(
    a.reduce((t, i) => t + TRUE[i], 0) - b.reduce((t, i) => t + TRUE[i], 0),
  )
  const [pa, pb] =
    share >= 0.5
      ? [21, Math.round((21 * (1 - share)) / share)]
      : [Math.round((21 * share) / (1 - share)), 21]
  return {
    a: a.map((i) => i + 1),
    b: b.map((i) => i + 1),
    pointsA: pa,
    pointsB: pb,
    day,
  }
}
function club(nights: number): SkillGame[] {
  const games: SkillGame[] = []
  for (let n = 0; n < nights; n++)
    for (let p = 0; p < 8; p++)
      for (let q = p + 1; q < 8; q++)
        for (let r = 0; r < 8; r++)
          for (let s = r + 1; s < 8; s++)
            if (r > p && ![p, q].includes(r) && ![p, q].includes(s))
              games.push(scored([p, q], [r, s], n * 7))
  return games
}

describe('fitSkill', () => {
  it('recovers the order of known strengths', () => {
    const fit = fitSkill(club(3), 21)
    expect(fit.map((p) => p.playerId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(fit.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // Close to the true values (the ridge pulls them slightly towards 0).
    fit.forEach((p) =>
      expect(Math.abs(p.strength - TRUE[p.playerId - 1])).toBeLessThan(0.1),
    )
  })

  it("doesn't care which pair is A", () => {
    const games = club(1)
    const swapped = games.map((g) => ({
      ...g,
      a: g.b,
      b: g.a,
      pointsA: g.pointsB,
      pointsB: g.pointsA,
    }))
    const x = fitSkill(games, 7)
    const y = fitSkill(swapped, 7)
    x.forEach((p, i) => expect(p.strength).toBeCloseTo(y[i].strength, 6))
  })

  it('counts each game once, by its point share (close games are close)', () => {
    // Players 1+2 beat 3+4 21–19 ten times; 5+6 beat 7+8 21–5 once.
    const games: SkillGame[] = [
      ...Array.from({ length: 10 }, () => ({
        a: [1, 2],
        b: [3, 4],
        pointsA: 21,
        pointsB: 19,
        day: 0,
      })),
      { a: [5, 6], b: [7, 8], pointsA: 21, pointsB: 5, day: 0 },
    ]
    const by = new Map(fitSkill(games, 0).map((p) => [p.playerId, p]))
    // One clear win says more than ten narrow ones, but stays moderate.
    expect(by.get(5)!.strength).toBeGreaterThan(by.get(1)!.strength)
    expect(by.get(5)!.strength).toBeLessThan(1)
    expect(by.get(1)!.games).toBe(10)
  })

  it('ignores games after the date, and counts old games less', () => {
    // The same results for player 1: some wins, some losses. Losses a year
    // old hurt less than the same losses this week.
    const wins = Array.from({ length: 4 }, () => ({
      a: [1, 2],
      b: [3, 4],
      pointsA: 21,
      pointsB: 15,
      day: 365,
    }))
    const losses = (day: number) =>
      Array.from({ length: 4 }, () => ({
        a: [1, 3],
        b: [2, 4],
        pointsA: 12,
        pointsB: 21,
        day,
      }))
    const later = [{ a: [2, 3], b: [1, 4], pointsA: 21, pointsB: 0, day: 400 }]
    const one = (games: typeof wins) =>
      fitSkill(games, 365).find((p) => p.playerId === 1)!
    expect(one([...wins, ...losses(0)]).strength).toBeGreaterThan(
      one([...wins, ...losses(365)]).strength,
    )
    expect(one([...wins, ...losses(0), ...later]).games).toBe(8)
  })

  it('handles no games, and is deterministic', () => {
    expect(fitSkill([], 0)).toEqual([])
    expect(fitSkill(club(1), 7)).toEqual(fitSkill(club(1), 7))
  })

  it('is fast enough at a real club size', () => {
    // ~150 players, ~2,500 games (two years of a 40-player night).
    let seed = 1
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const games: SkillGame[] = Array.from({ length: 2500 }, (_, i) => {
      const p = Array.from({ length: 4 }, () => 1 + Math.floor(rand() * 150))
      return {
        a: [p[0], p[1]],
        b: [p[2], p[3]],
        pointsA: 21,
        pointsB: Math.floor(rand() * 21),
        day: Math.floor(i / 50) * 7,
      }
    })
    const t = performance.now()
    fitSkill(games, 700)
    const ms = performance.now() - t
    console.log(`fitSkill: 150 players, 2,500 games in ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(5000)
  })
})
