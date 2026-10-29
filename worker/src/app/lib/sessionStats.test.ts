import { describe, expect, it } from 'vitest'
import type { Session } from './session'
import { sessionStats } from './sessionStats'

type Sets = Array<[number | '', number | '']>

// One box of 4 (ids 1–4); each match is 1&2 vs 3&4 with the given scores.
function night(...matches: Sets[]): Session {
  const players = [1, 2, 3, 4].map((id) => ({ id, name: `P${id}` }))
  return {
    date: '2026-01-06',
    status: 'closed',
    attendees: [...players, { id: 5, name: 'P5' }],
    leaderboardBefore: players,
    leaderboardAfter: players,
    boxes: [
      {
        players,
        finalPlacings: null,
        matches: matches.map((sets) => ({
          pairs: [
            [1, 2],
            [3, 4],
          ],
          sets,
        })),
      },
    ],
  }
}

describe('sessionStats', () => {
  it('counts matches, games and points', () => {
    const s = sessionStats(
      night(
        [
          [21, 15],
          [21, 19],
          ['', ''],
        ],
        [
          [21, 10],
          [18, 21],
          [22, 20],
        ],
      ),
    )
    expect(s).toMatchObject({
      players: 5,
      boxes: 1,
      matches: 2,
      threeGameMatches: 1,
      games: 5,
      points: 76 + 31 + 39 + 42,
      avgMargin: (6 + 2 + 11 + 3 + 2) / 5,
    })
  })

  it('finds the records, first one on a tie', () => {
    const s = sessionStats(
      night(
        [
          [21, 19],
          [21, 5],
        ],
        [
          [22, 20],
          [10, 21],
          [21, 16],
        ],
      ),
    )
    expect(s.closestGame).toEqual({
      box: 1,
      game: 1,
      pairs: [
        [1, 2],
        [3, 4],
      ],
      score: [21, 19],
    })
    expect(s.biggestBlowout).toMatchObject({ game: 2, score: [21, 5] })
    expect(s.highestScoringMatch).toMatchObject({
      points: 42 + 31 + 37,
      scores: [
        [22, 20],
        [10, 21],
        [21, 16],
      ],
    })
  })

  it('leaves unfinished matches out of the match counts and records', () => {
    const s = sessionStats(
      night([
        [21, 0],
        ['', ''],
      ]),
    )
    expect(s).toMatchObject({
      matches: 0,
      games: 1,
      points: 21,
      closestGame: null,
      highestScoringMatch: null,
    })
  })

  it('has no average on an empty night', () => {
    expect(sessionStats(night()).avgMargin).toBeNull()
  })
})
