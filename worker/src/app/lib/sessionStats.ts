// A closed night's numbers for the Results step (the lab's Sessions-tab stat
// cards and records, club-next temp/stats-experiments). In the code a match
// is best of 3 sets; on screen those are a match and its games.
import { ALL_SET_FORMATS, isValidSet } from '../../domain/scoring'
import { matchStatus, toSetScores } from './session'
import type { Session } from './session'

/** The two pairs of a match, as player ids. */
export type Pairs = [number[], number[]]

export interface GameRecord {
  /** 1-based. */
  box: number
  /** 1-based game (set) within the match. */
  game: number
  pairs: Pairs
  score: [number, number]
}

export interface MatchRecord {
  box: number
  pairs: Pairs
  scores: [number, number][]
  points: number
}

export interface SessionStats {
  players: number
  boxes: number
  /** Finished matches. */
  matches: number
  threeGameMatches: number
  /** Valid games entered (sets in the code). */
  games: number
  points: number
  /** Average winning margin per game, in points. */
  avgMargin: number | null
  closestGame: GameRecord | null
  biggestBlowout: GameRecord | null
  highestScoringMatch: MatchRecord | null
}

export function sessionStats(session: Session): SessionStats {
  let matches = 0
  let threeGameMatches = 0
  let games = 0
  let points = 0
  let margins = 0
  let closestGame: GameRecord | null = null
  let biggestBlowout: GameRecord | null = null
  let highestScoringMatch: MatchRecord | null = null
  const margin = (g: GameRecord) => Math.abs(g.score[0] - g.score[1])

  session.boxes.forEach((box, bi) => {
    for (const m of box.matches) {
      const pairs: Pairs = m.pairs
      const valid = toSetScores(m.sets).flatMap(([a, b], si) =>
        a !== null && b !== null && isValidSet(a, b, ALL_SET_FORMATS)
          ? [{ game: si + 1, score: [a, b] as [number, number] }]
          : [],
      )
      for (const { score } of valid) {
        games++
        points += score[0] + score[1]
        margins += Math.abs(score[0] - score[1])
      }
      // Records and match counts only from finished matches.
      if (matchStatus(m) !== 'complete') continue
      matches++
      if (valid.length >= 3) threeGameMatches++
      for (const v of valid) {
        const g: GameRecord = { box: bi + 1, pairs, ...v }
        if (!closestGame || margin(g) < margin(closestGame)) closestGame = g
        if (!biggestBlowout || margin(g) > margin(biggestBlowout))
          biggestBlowout = g
      }
      const total = valid.reduce((n, v) => n + v.score[0] + v.score[1], 0)
      if (!highestScoringMatch || total > highestScoringMatch.points)
        highestScoringMatch = {
          box: bi + 1,
          pairs,
          scores: valid.map((v) => v.score),
          points: total,
        }
    }
  })

  return {
    players: session.attendees.length,
    boxes: session.boxes.length,
    matches,
    threeGameMatches,
    games,
    points,
    avgMargin: games ? margins / games : null,
    closestGame,
    biggestBlowout,
    highestScoringMatch,
  }
}
