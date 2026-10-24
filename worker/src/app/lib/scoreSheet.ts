// Score entry rules for one game, from the live app (js/app.js setScore and
// showThirdSet), on its own scoring rules (src/domain). Pure, unit-tested.
import { ALL_SET_FORMATS, isValidSet } from '../../domain/scoring'
import type { SetScore } from '../../domain/scoring'

/** A set with both scores entered and valid. */
export function setComplete(
  s: SetScore | undefined,
): s is readonly [number, number] {
  return (
    s !== undefined &&
    s[0] !== null &&
    s[1] !== null &&
    isValidSet(s[0], s[1], ALL_SET_FORMATS)
  )
}

/** The third set only when the first two are complete and split. */
export function showThirdSet(sets: readonly SetScore[]): boolean {
  const [a, b] = sets
  if (!setComplete(a) || !setComplete(b)) return false
  return a[0] > a[1] !== b[0] > b[1]
}

/**
 * The live app's setScore: put one score in, drop trailing empty sets, and
 * drop a stale third set when the first two became a sweep.
 */
export function withScore(
  sets: readonly SetScore[],
  setIdx: number,
  side: 0 | 1,
  value: number | null,
): SetScore[] {
  const next: (readonly [number | null, number | null])[] = [...sets]
  while (next.length <= setIdx) next.push([null, null])
  const s = next[setIdx]
  next[setIdx] = side === 0 ? [value, s[1]] : [s[0], value]
  while (next.length > 0) {
    const last = next[next.length - 1]
    if (last[0] === null && last[1] === null) next.pop()
    else break
  }
  if (next.length > 2 && !showThirdSet(next)) {
    const [a, b] = next
    if (setComplete(a) && setComplete(b)) return next.slice(0, 2)
  }
  return next
}
