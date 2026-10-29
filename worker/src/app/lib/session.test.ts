// The new UI's ladder-after must match the old UI's (what Close sends).
import { describe, expect, it } from 'vitest'
import {
  applyLeaderboardUpdate,
  buildBoxesFromLayout,
} from '../../browser/algorithm'
import { ladderAfter, movement, progress } from './session'
import type { Session } from './session'

// A night: 9 players in a box of 4 and a box of 5, random finished scores.
function night(seed: number): Session {
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
  }))
  const attending = [...players].sort(() => rand() - 0.5).slice(0, 9)
  const byRank = [...attending].sort((a, b) => a.id - b.id)
  const layout = [byRank.slice(0, 4), byRank.slice(4)]
  const boxes = buildBoxesFromLayout(layout.map((b) => b.map((p) => p.name)))
  const game = (): [number, number] => {
    const lose = Math.floor(rand() * 20)
    return rand() < 0.5 ? [21, lose] : [lose, 21]
  }
  return {
    date: '2026-01-06',
    status: 'games',
    attendees: attending,
    leaderboardBefore: players,
    leaderboardAfter: null,
    boxes: boxes.map((b, bi) => ({
      players: layout[bi],
      finalPlacings: null,
      matches: b.matches.map((m) => {
        const g1 = game()
        const g2 = game()
        const sets: [number, number][] =
          g1[0] > g1[1] === g2[0] > g2[1] ? [g1, g2] : [g1, g2, game()]
        // The old rules' pairs are box positions; the session's are ids.
        const id = (i: number) => layout[bi][i].id
        return {
          pairs: [m.pair1.map(id), m.pair2.map(id)] as [number[], number[]],
          sets,
        }
      }),
    })),
  }
}

describe('ladderAfter', () => {
  it('matches the old UI on random nights', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = night(seed)
      const name = (id: number) => `P${id}`
      const old = applyLeaderboardUpdate(
        n.boxes.map((b) => {
          const pos = (id: number) => b.players.findIndex((p) => p.id === id)
          return {
            players: b.players.map((p) => p.name),
            matches: b.matches.map((m) => ({
              pair1: m.pairs[0].map(pos),
              pair2: m.pairs[1].map(pos),
              sets: m.sets,
            })),
            finalPlacings: null,
          }
        }),
        n.leaderboardBefore.map((p) => p.name),
      )
      expect(ladderAfter(n).map(name)).toEqual(old)
    }
  })

  it('counts moves and progress', () => {
    expect(movement([1, 2, 3, 4], [2, 1, 3, 4])).toEqual({ up: 1, down: 1 })
    expect(progress(night(1).boxes)).toEqual({
      boxes: 2,
      finishedBoxes: 2,
      matches: 8,
      matchesTotal: 8,
    })
  })
})
