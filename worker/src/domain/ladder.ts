// Ladder: chained per-session snapshots (decisions.md, "Rankings").
//
// - A session's ladder-after = applyMovement(ladder-before, final standings).
// - The current ladder = latest closed session's ladder-after (or empty) with
//   every adjustment made after that session's ladder-before snapshot applied
//   in order. Adjustments are absolute operations, so re-closing a session
//   (which only changes the base) never invalidates them.

export type LadderRule = '2up2down'
export const LADDER_RULES: readonly { value: LadderRule; label: string }[] = [
  { value: '2up2down', label: '2 up, 2 down' },
]

/**
 * Given each box's players in final placing order (top box first), produce the
 * attendees' new relative order with the 2-up-2-down cascade. Ported verbatim
 * from the old app's `buildAttendeeOrder`: between every adjacent pair of
 * boxes the lower box's top 2 swap with the upper box's bottom 2; the last
 * box's bottom 2 stay put.
 */
export function cascadeTwoUpTwoDown<TPlayer>(
  sortedBoxes: readonly (readonly TPlayer[])[],
): TPlayer[] {
  if (sortedBoxes.length === 0) return []
  const order: TPlayer[] = []
  order.push(...sortedBoxes[0].slice(0, -2))
  for (let i = 0; i + 1 < sortedBoxes.length; i++) {
    const curr = sortedBoxes[i]
    const next = sortedBoxes[i + 1]
    order.push(next[0], next[1])
    order.push(...curr.slice(-2))
    order.push(...next.slice(2, -2))
  }
  order.push(...sortedBoxes[sortedBoxes.length - 1].slice(-2))
  return order
}

/**
 * New ladder after a session: attendees are reshuffled within the ladder slots
 * they occupied; absent players keep their positions; anyone not on the
 * ladder-before (joined during games) goes to the bottom. Port of the old
 * app's `applyLeaderboardUpdate`.
 */
export function applyMovement<TPlayer>(
  ladderBefore: readonly TPlayer[],
  sortedBoxes: readonly (readonly TPlayer[])[],
  rule: LadderRule,
  newcomers: readonly TPlayer[] = [],
): TPlayer[] {
  if (rule !== '2up2down')
    throw new Error(`Unknown ladder rule: ${String(rule)}`)
  const newOrder = cascadeTwoUpTwoDown(sortedBoxes)
  const index = new Map(ladderBefore.map((p, i) => [p, i]))
  const slots = sortedBoxes
    .flat()
    .map((p) => index.get(p))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b)
  const result = ladderBefore.slice()
  const extra: TPlayer[] = []
  newOrder.forEach((p, i) => {
    if (i < slots.length) result[slots[i]] = p
    else extra.push(p)
  })
  for (const p of [...extra, ...newcomers])
    if (!result.includes(p)) result.push(p)
  return result
}

export type LadderAdjustment<TPlayer> =
  | { type: 'import'; order: readonly TPlayer[] }
  | { type: 'join'; person: TPlayer }
  | { type: 'set_position'; person: TPlayer; position: number }

/** Apply adjustments in order. Positions are 1-based. */
export function applyAdjustments<TPlayer>(
  base: readonly TPlayer[],
  adjustments: readonly LadderAdjustment<TPlayer>[],
): TPlayer[] {
  let ladder = base.slice()
  for (const adj of adjustments) {
    if (adj.type === 'import') {
      const inFile = new Set(adj.order)
      ladder = [...adj.order, ...ladder.filter((p) => !inFile.has(p))]
    } else if (adj.type === 'join') {
      if (!ladder.includes(adj.person)) ladder.push(adj.person)
    } else {
      ladder = ladder.filter((p) => p !== adj.person)
      const idx = Math.min(Math.max(adj.position - 1, 0), ladder.length)
      ladder.splice(idx, 0, adj.person)
    }
  }
  return ladder
}

/** Restrict a ladder to current members, appending any member it lacks. */
export function normaliseLadder<TPlayer>(
  ladder: readonly TPlayer[],
  members: readonly TPlayer[],
): TPlayer[] {
  const memberSet = new Set(members)
  const out = ladder.filter(
    (p, i) => memberSet.has(p) && ladder.indexOf(p) === i,
  )
  for (const m of members) if (!out.includes(m)) out.push(m)
  return out
}
