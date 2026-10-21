// Set and game (match) scoring rules. Points per set is a club setting
// (11 / 15 / 21); caps follow standard rules: 11→15, 15→21, 21→30, win by 2,
// sudden death at cap-1 all. Ported from the old app's `isValidSetForRules`.

export type PointsPerSet = 11 | 15 | 21
export const POINTS_PER_SET_OPTIONS: readonly PointsPerSet[] = [11, 15, 21]
export const SETS_PER_MATCH = 3 // best of 3; best of 5 is a possible future option
export const SETS_TO_WIN = 2

const CAPS: Record<PointsPerSet, number> = { 11: 15, 15: 21, 21: 30 }

export function capFor(pointsPerSet: PointsPerSet): number {
  return CAPS[pointsPerSet]
}

/** A set score as stored; null means "not entered". */
export type SetScore = readonly [number | null, number | null]

export function isValidSet(
  a: number,
  b: number,
  pointsPerSet: PointsPerSet,
): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b)
    return false
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const winAt = pointsPerSet
  const cap = CAPS[pointsPerSet]
  const deuceAt = winAt - 1
  if (hi === winAt && lo <= deuceAt - 1) return true
  if (lo >= deuceAt && hi === lo + 2 && hi <= cap) return true
  if (hi === cap && lo === cap - 1) return true
  return false
}

/** Human-readable reason a finished-looking set is invalid, or null if fine. */
export function setProblem(
  a: number,
  b: number,
  pointsPerSet: PointsPerSet,
): string | null {
  if (isValidSet(a, b, pointsPerSet)) return null
  if (a === b) return 'A set can’t end level'
  return `${a}–${b} isn’t a finished set (to ${pointsPerSet}, cap ${CAPS[pointsPerSet]})`
}

export type MatchStatus = 'not_started' | 'in_progress' | 'invalid' | 'complete'

export interface MatchResult {
  status: MatchStatus
  /** 1 or 2 when complete, otherwise null. */
  winner: 1 | 2 | null
  setsWon: [number, number]
  points: [number, number]
}

export function evaluateMatch(
  sets: readonly SetScore[],
  pointsPerSet: PointsPerSet,
): MatchResult {
  let any = false
  let invalid = false
  let partial = false
  const setsWon: [number, number] = [0, 0]
  const points: [number, number] = [0, 0]
  for (const [a, b] of sets) {
    if (a == null && b == null) continue
    any = true
    if (a == null || b == null) {
      partial = true
      continue
    }
    if (!isValidSet(a, b, pointsPerSet)) {
      invalid = true
      continue
    }
    points[0] += a
    points[1] += b
    if (a > b) setsWon[0]++
    else setsWon[1]++
  }
  let status: MatchStatus
  if (!any) status = 'not_started'
  else if (invalid) status = 'invalid'
  else if (!partial && (setsWon[0] >= SETS_TO_WIN || setsWon[1] >= SETS_TO_WIN))
    status = 'complete'
  else status = 'in_progress'
  const winner =
    status === 'complete' ? (setsWon[0] > setsWon[1] ? 1 : 2) : null
  return { status, winner, setsWon, points }
}

/**
 * Walkover completion for a retired player's game: keep completed sets, then
 * fill the remaining sets needed with `pointsPerSet`–0 to the opposing pair.
 * `losingPair` is the pair containing the retired player.
 */
export function walkoverSets(
  sets: readonly SetScore[],
  losingPair: 1 | 2,
  pointsPerSet: PointsPerSet,
): SetScore[] {
  const out: SetScore[] = []
  const won: [number, number] = [0, 0]
  for (const s of sets.slice(0, SETS_PER_MATCH)) {
    const [a, b] = s
    if (a != null && b != null && isValidSet(a, b, pointsPerSet)) {
      out.push(s)
      if (a > b) won[0]++
      else won[1]++
    } else break
    if (won[0] >= SETS_TO_WIN || won[1] >= SETS_TO_WIN) return out
  }
  const winnerIdx = losingPair === 1 ? 1 : 0
  while (won[winnerIdx] < SETS_TO_WIN) {
    out.push(losingPair === 1 ? [0, pointsPerSet] : [pointsPerSet, 0])
    won[winnerIdx]++
  }
  return out
}
