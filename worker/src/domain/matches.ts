// A match is two pairs of players and its set scores, whatever made the
// pairs. The box ladder's pairing table (pairings.ts) is one way to make them;
// standings, stats and score entry only look at the pairs themselves.
import type { SetScore } from './scoring'

/** Pair A and pair B, as players. */
export type Pairs<TPlayer> = readonly [readonly TPlayer[], readonly TPlayer[]]

export interface MatchInput<TPlayer> {
  pairs: Pairs<TPlayer>
  sets: readonly SetScore[]
}

/** Players of a group (e.g. a box) not playing in this match. */
export function sittingOut<TPlayer>(
  players: readonly TPlayer[],
  pairs: Pairs<TPlayer>,
): TPlayer[] {
  const playing = new Set([...pairs[0], ...pairs[1]])
  return players.filter((p) => !playing.has(p))
}

/**
 * Why a match's pairs don't fit its group, or null if they do: doubles (two
 * pairs of two), four different players, all in the group.
 */
export function pairsProblem<TPlayer>(
  players: readonly TPlayer[],
  pairs: Pairs<TPlayer>,
): string | null {
  // Checked as data: it comes from requests.
  if (
    !Array.isArray(pairs) ||
    pairs.length !== 2 ||
    pairs.some((p) => !Array.isArray(p) || p.length !== 2)
  )
    return 'a match needs two pairs of two players'
  const all = [...pairs[0], ...pairs[1]]
  if (new Set(all).size !== 4) return 'a match needs four different players'
  if (all.some((p) => !players.includes(p)))
    return 'a match can only have players from its box'
  return null
}
