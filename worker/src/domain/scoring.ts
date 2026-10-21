// Set and game (match) scoring rules. A set is played to 11, 15 or 21 points;
// caps follow standard rules: 11→15, 15→21, 21→30, win by 2, sudden death at
// cap-1 all. Ported from the old app's `isValidSetForRules`.
//
// club adaptation (S1, decision A): sessions mix formats (real data has sets
// to 21, 15 and 11 in the same night), so validation takes the list of
// allowed formats and a set is valid under any of them, instead of club-next's
// single points-per-set setting.

export type PointsPerSet = 11 | 15 | 21
export const POINTS_PER_SET_OPTIONS: readonly PointsPerSet[] = [11, 15, 21]
export const SETS_PER_MATCH = 3 // best of 3; best of 5 is a possible future option
export const SETS_TO_WIN = 2

const CAPS: Record<PointsPerSet, number> = { 11: 15, 15: 21, 21: 30 }

export function capFor(pointsPerSet: PointsPerSet): number {
  return CAPS[pointsPerSet]
}

/** The set formats a session accepts. */
export type SetFormats = readonly PointsPerSet[]
/** Every format played at club sessions (what the old app accepted). */
export const ALL_SET_FORMATS: SetFormats = [21, 15, 11]

/** A set score as stored; null means "not entered". */
export type SetScore = readonly [number | null, number | null]

export function isValidSet(a: number, b: number, formats: SetFormats): boolean {
  return formats.some((f) => isValidSetFor(a, b, f))
}

function isValidSetFor(a: number, b: number, pointsPerSet: PointsPerSet) {
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
  formats: SetFormats,
): string | null {
  if (isValidSet(a, b, formats)) return null
  if (a === b) return 'A set can’t end level'
  const rules = formats.map((f) => `to ${f}, cap ${CAPS[f]}`).join('; or ')
  return `${a}–${b} isn’t a finished set (${rules})`
}

export type MatchStatus = 'not_started' | 'in_progress' | 'invalid' | 'complete'

export interface MatchResult {
  status: MatchStatus
  /** 1 or 2 when complete, otherwise null. */
  winner: 1 | 2 | null
  setsWon: [number, number]
  points: [number, number]
}

/**
 * A half-entered set makes the match `in_progress` even if another set is
 * invalid (someone is still typing); the old app behaved this way.
 */
export function evaluateMatch(
  sets: readonly SetScore[],
  formats: SetFormats,
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
    if (!isValidSet(a, b, formats)) {
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
  else if (partial) status = 'in_progress'
  else if (invalid) status = 'invalid'
  else if (setsWon[0] >= SETS_TO_WIN || setsWon[1] >= SETS_TO_WIN)
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
    if (a != null && b != null && isValidSet(a, b, [pointsPerSet])) {
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
