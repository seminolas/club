// Box standings — the single function used both for live standings during the
// night and for closing (decided: "same rules"). Ported from the old app's
// `computeBoxStandings`. Tie-breaks: games won → set difference → point
// difference → ladder-before position (better rank wins).

import type { MatchInput } from './matches'
import { evaluateMatch } from './scoring'
import type { SetFormats } from './scoring'

export interface BoxInput<TPlayer> {
  /** Players in box order (position 0..n-1). */
  players: readonly TPlayer[]
  /** The box's matches, each with its own pairs (players of this box). */
  matches: readonly MatchInput<TPlayer>[]
}

export interface Standing<TPlayer> {
  player: TPlayer
  position: number
  placing: number
  gamesPlayed: number
  gamesWon: number
  setsWon: number
  setsLost: number
  pointsFor: number
  pointsAgainst: number
}

export function computeStandings<TPlayer>(
  box: BoxInput<TPlayer>,
  formats: SetFormats,
  ladderRank: (player: TPlayer) => number,
): Standing<TPlayer>[] {
  const stats: Standing<TPlayer>[] = box.players.map((player, position) => ({
    player,
    position,
    placing: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    setsWon: 0,
    setsLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }))

  const byPlayer = new Map(stats.map((s) => [s.player, s]))
  for (const m of box.matches) {
    const r = evaluateMatch(m.sets, formats)
    if (r.status === 'not_started' || r.status === 'invalid') continue
    m.pairs.forEach((pair, side) => {
      const other = side === 0 ? 1 : 0
      for (const player of pair) {
        const s = byPlayer.get(player)
        if (!s) continue
        s.setsWon += r.setsWon[side]
        s.setsLost += r.setsWon[other]
        s.pointsFor += r.points[side]
        s.pointsAgainst += r.points[other]
        if (r.status === 'complete') {
          s.gamesPlayed++
          if (r.winner === side + 1) s.gamesWon++
        }
      }
    })
  }

  const sorted = stats.slice().sort((a, b) => {
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon
    const dSets = b.setsWon - b.setsLost - (a.setsWon - a.setsLost)
    if (dSets !== 0) return dSets
    const dPts = b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
    if (dPts !== 0) return dPts
    return ladderRank(a.player) - ladderRank(b.player)
  })
  sorted.forEach((s, i) => {
    s.placing = i + 1
  })
  return sorted
}

export function isBoxComplete(
  box: BoxInput<unknown>,
  formats: SetFormats,
): boolean {
  return box.matches.every(
    (m) => evaluateMatch(m.sets, formats).status === 'complete',
  )
}
