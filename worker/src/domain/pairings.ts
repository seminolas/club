// Doubles pairings per box size, from the club's printed score sheets
// (ported verbatim from the old app's `algorithm.js`). Indices are 0-based box
// positions. This is the single copy, shared by client and server; the old app
// kept two copies and they drifted (see its AGENTS.md).

export interface Pairing {
  pair1: readonly [number, number]
  pair2: readonly [number, number]
}

const PAIRINGS: Record<number, readonly Pairing[]> = {
  4: [
    { pair1: [0, 1], pair2: [2, 3] },
    { pair1: [0, 2], pair2: [1, 3] },
    { pair1: [0, 3], pair2: [1, 2] },
  ],
  5: [
    { pair1: [0, 1], pair2: [2, 4] },
    { pair1: [2, 3], pair2: [1, 4] },
    { pair1: [0, 2], pair2: [3, 4] },
    { pair1: [0, 3], pair2: [1, 2] },
    { pair1: [0, 4], pair2: [1, 3] },
  ],
  6: [
    { pair1: [0, 5], pair2: [2, 4] },
    { pair1: [1, 2], pair2: [0, 3] },
    { pair1: [1, 4], pair2: [3, 5] },
    { pair1: [1, 5], pair2: [0, 2] },
    { pair1: [2, 5], pair2: [3, 4] },
    { pair1: [0, 4], pair2: [1, 3] },
  ],
  7: [
    { pair1: [0, 1], pair2: [2, 3] },
    { pair1: [0, 4], pair2: [1, 5] },
    { pair1: [0, 2], pair2: [4, 6] },
    { pair1: [0, 3], pair2: [5, 6] },
    { pair1: [1, 6], pair2: [2, 5] },
    { pair1: [1, 4], pair2: [3, 6] },
    { pair1: [2, 4], pair2: [3, 5] },
  ],
}

export const SUPPORTED_BOX_SIZES = [4, 5, 6, 7] as const

export function getPairings(boxSize: number): readonly Pairing[] {
  const pairings = PAIRINGS[boxSize]
  if (!pairings) throw new Error(`Unsupported box size: ${boxSize}`)
  return pairings
}

/** Box positions not playing in the given match (empty for a box of 4). */
export function getSitOut(boxSize: number, matchIndex: number): number[] {
  const p = getPairings(boxSize)[matchIndex]
  const playing = new Set([...p.pair1, ...p.pair2])
  return Array.from({ length: boxSize }, (_, i) => i).filter(
    (i) => !playing.has(i),
  )
}

/**
 * The box ladder's schedule: a box's players, in box order, to each match's
 * pairs (pair A, pair B), following the table above.
 */
export function scheduleBox<TPlayer>(
  players: readonly TPlayer[],
): [TPlayer[], TPlayer[]][] {
  return getPairings(players.length).map((p) => [
    p.pair1.map((i) => players[i]),
    p.pair2.map((i) => players[i]),
  ])
}
