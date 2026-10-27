// Skill: a statistical estimate of each player's strength from their game
// scores, separate from the ladder (which decides boxes). Chosen 2026-10-28
// after replaying every closed night: it predicted match winners about 10
// points better than the ladder and moved far less from week to week.
//
// The model (Bradley–Terry with additive pairs): each player has a strength,
// 0 = average; a pair's strength is the sum of its two players'; the share of
// points pair A is expected to win in a game is σ(strength A − strength B).
// The fit finds the strengths that best explain every game: each game counts
// as one piece of evidence, by its point share (21–19 is nearly a draw, 21–5
// a clear win), older games count less (half-life a year), and a gentle pull
// towards average (ridge, λ) keeps players with few games from extremes.

export interface SkillGame {
  /** Pair A's player ids, and pair B's. */
  a: readonly number[]
  b: readonly number[]
  pointsA: number
  pointsB: number
  /** When it was played, in days (e.g. Date.parse(date) / 864e5). */
  day: number
}

export interface SkillOptions {
  /** Pull towards average. 0.5 predicted best in the replay. */
  lambda?: number
  /** Age at which a game counts half. */
  halfLifeDays?: number
}

export interface PlayerSkill {
  playerId: number
  /** 0 = average; +0.2 between pairs ≈ 55% of the points. */
  strength: number
  /** 1 = strongest, among everyone with a game. */
  rank: number
  /** Games played (unweighted). */
  games: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** Strengths as of `asOfDay`, from every game played before or on it. */
export function fitSkill(
  games: readonly SkillGame[],
  asOfDay: number,
  { lambda = 0.5, halfLifeDays = 365 }: SkillOptions = {},
): PlayerSkill[] {
  const counted = games.filter(
    (g) => g.day <= asOfDay && g.pointsA + g.pointsB > 0,
  )
  const ids = [...new Set(counted.flatMap((g) => [...g.a, ...g.b]))].sort(
    (x, y) => x - y,
  )
  const index = new Map(ids.map((id, i) => [id, i]))
  const gamesPlayed = new Float64Array(ids.length)
  const rows = counted.map((g) => {
    const w = 0.5 ** ((asOfDay - g.day) / halfLifeDays)
    const share = g.pointsA / (g.pointsA + g.pointsB)
    const a = g.a.map((id) => index.get(id) as number)
    const b = g.b.map((id) => index.get(id) as number)
    for (const i of [...a, ...b]) gamesPlayed[i]++
    return { a, b, wonA: share * w, wonB: (1 - share) * w }
  })

  const x = new Float64Array(ids.length)
  const diff = (v: Float64Array, r: (typeof rows)[number]) =>
    r.a.reduce((t, i) => t + v[i], 0) - r.b.reduce((t, i) => t + v[i], 0)
  // Penalised log-likelihood (concave): maximised by diagonally
  // preconditioned Newton steps, halving the step until it improves.
  const objective = (v: Float64Array) => {
    let f = 0
    for (const r of rows) {
      const d = diff(v, r)
      f += r.wonA * Math.log(sigmoid(d)) + r.wonB * Math.log(sigmoid(-d))
    }
    for (const s of v) f -= lambda * s * s
    return f
  }
  let f = objective(x)
  for (let it = 0; it < 200; it++) {
    const grad = new Float64Array(ids.length)
    const curv = new Float64Array(ids.length).fill(2 * lambda)
    for (const r of rows) {
      const p = sigmoid(diff(x, r))
      const g = r.wonA * (1 - p) - r.wonB * p
      const c = (r.wonA + r.wonB) * p * (1 - p)
      for (const i of r.a) {
        grad[i] += g
        curv[i] += c
      }
      for (const i of r.b) {
        grad[i] -= g
        curv[i] += c
      }
    }
    for (let i = 0; i < x.length; i++) grad[i] -= 2 * lambda * x[i]
    let step = 1
    let next = x
    let fNext = f
    while (step > 1e-6) {
      next = x.map((v, i) => v + (step * grad[i]) / curv[i])
      fNext = objective(next)
      if (fNext >= f) break
      step /= 2
    }
    const gain = fNext - f
    x.set(next)
    f = fNext
    if (gain <= 1e-9 * Math.max(1, Math.abs(f))) break
  }

  return ids
    .map((playerId, i) => ({
      playerId,
      strength: x[i],
      games: gamesPlayed[i],
    }))
    .sort((p, q) => q.strength - p.strength || p.playerId - q.playerId)
    .map((p, i) => ({ ...p, rank: i + 1 }))
}
