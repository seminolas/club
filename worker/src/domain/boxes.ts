// Splitting the night's attendees into boxes. Generalised from the old app's
// `boxSizeOptions` to a club's allowed sizes (club setting); the rules are the
// same: for each box count keep only the size mix(es) with minimal spread
// (largest minus smallest box), order most boxes first, and only ever offer a
// box of 7 on its own when exactly 7 attend.

export interface BoxSizeOption {
  sizes: number[]
  boxCount: number
}

export function boxSizeOptions(
  attendeeCount: number,
  allowedSizes: readonly number[],
): BoxSizeOption[] {
  const allowed = new Set(allowedSizes)
  if (attendeeCount === 7 && allowed.has(7))
    return [{ sizes: [7], boxCount: 1 }]

  const sizes = [4, 5, 6].filter((s) => allowed.has(s))
  const byCount = new Map<number, { spread: number; mixes: number[][] }>()

  const recurse = (i: number, remaining: number, counts: number[]) => {
    if (i === sizes.length) {
      if (remaining !== 0) return
      const boxCount = counts.reduce((a, b) => a + b, 0)
      if (boxCount === 0) return
      const present = sizes.filter((_, k) => counts[k] > 0)
      const spread = Math.max(...present) - Math.min(...present)
      const existing = byCount.get(boxCount)
      if (!existing || spread < existing.spread) {
        byCount.set(boxCount, { spread, mixes: [counts.slice()] })
      } else if (spread === existing.spread) {
        existing.mixes.push(counts.slice())
      }
      return
    }
    for (let c = 0; c * sizes[i] <= remaining; c++) {
      counts.push(c)
      recurse(i + 1, remaining - c * sizes[i], counts)
      counts.pop()
    }
  }
  recurse(0, attendeeCount, [])

  const options: BoxSizeOption[] = []
  for (const [boxCount, { mixes }] of byCount) {
    for (const counts of mixes) {
      const boxSizes = sizes.flatMap((s, k) => Array<number>(counts[k]).fill(s))
      options.push({ sizes: boxSizes, boxCount })
    }
  }
  options.sort((x, y) => y.boxCount - x.boxCount)
  return options
}

/**
 * Slice attendees (already sorted by ladder position, best first) into boxes
 * of the given sizes. `sizes` is ascending, so the top box is the smallest,
 * as in the old app.
 */
export function buildBoxes<T>(
  sortedAttendees: readonly T[],
  sizes: readonly number[],
): T[][] {
  const boxes: T[][] = []
  let idx = 0
  for (const size of sizes) {
    boxes.push(sortedAttendees.slice(idx, idx + size))
    idx += size
  }
  return boxes
}

/**
 * Parse a typed box layout: one box per line, comma-separated display names.
 * `byDisplay` maps each attendee's display name, exactly as printed, to the
 * player; anything else is rejected rather than guessed at. Every attendee
 * must be placed exactly once, in a box of 4–7 (the sizes with pairings).
 * The layout is only usable when `errors` is empty. Ported from club's
 * `parseBoxLayout` (custom box layouts, 2026-10-14), which club-next lacks.
 */
export function parseBoxLayout<T>(
  text: string,
  byDisplay: ReadonlyMap<string, T>,
): { layout: T[][]; errors: string[] } {
  const errors: string[] = []
  const layout: T[][] = []
  const seen = new Set<T>()

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  lines.forEach((line, li) => {
    const box: T[] = []
    for (const token of line
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)) {
      const player = byDisplay.get(token)
      if (player === undefined) {
        errors.push(`Box ${li + 1}: unknown player "${token}"`)
      } else if (seen.has(player)) {
        errors.push(`Box ${li + 1}: "${token}" is already in a box`)
      } else {
        seen.add(player)
        box.push(player)
      }
    }
    if (box.length < 4 || box.length > 7) {
      errors.push(
        `Box ${li + 1} has ${box.length} player${box.length !== 1 ? 's' : ''} (must be 4–7)`,
      )
    }
    layout.push(box)
  })

  const missing = [...byDisplay]
    .filter(([, player]) => !seen.has(player))
    .map(([display]) => display)
  if (missing.length) errors.push(`Not in any box: ${missing.join(', ')}`)
  if (!lines.length) errors.push('No boxes entered')

  return { layout, errors }
}
