// Replays every closed session through the old rules (frozen js/algorithm.js)
// and the new shared rules, and compares both with the ladder-after that was
// stored when the session closed. Read-only: uses the public API.
// Usage: npx tsx scripts/replay-ladder.mts [baseUrl]   (default: staging)
import { createRequire } from 'node:module'
import * as rules from '../src/browser/algorithm'
import type { Rules } from '../src/test/rules-under-test'

const legacy = createRequire(import.meta.url)(
  '../src/test/legacy-algorithm.cjs',
) as Rules
const BASE =
  process.argv[2] ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'

type Named = { id: number; name: string }
interface ApiSession {
  date: string
  status: string
  leaderboardBefore: Named[]
  leaderboardAfter: Named[] | null
  boxes: {
    players: Named[]
    matches: { pair1: number[]; pair2: number[]; sets: (number | null)[][] }[]
  }[]
}

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json() as Promise<T>
}

const firstDiff = (a: string[], b: string[]) => {
  const i = a.findIndex((x, k) => x !== b[k])
  return i === -1 && a.length === b.length
    ? null
    : `#${i + 1}: ${a[i]} vs ${b[i]} (lengths ${a.length}/${b.length})`
}

const list = await get<{ date: string; status: string }[]>('/api/sessions')
let problems = 0
for (const { date, status } of list
  .filter((s) => s.status === 'closed')
  .reverse()) {
  const s = await get<ApiSession>(`/api/sessions/${date}`)
  const names = (arr: Named[]) => arr.map((p) => p.name)
  const lb = names(s.leaderboardBefore)
  const stored = s.leaderboardAfter ? names(s.leaderboardAfter) : null
  // Same shape js/app.js builds from the API response.
  const boxes = () =>
    s.boxes.map((b) => ({
      players: names(b.players),
      matches: structuredClone(b.matches) as never,
      finalPlacings: null,
    }))
  const boxPlayers = s.boxes.flatMap((b) => names(b.players))
  const notOnLadder = boxPlayers.filter((p) => !lb.includes(p))

  const complete = rules.allScoresComplete(boxes())
  const standingsSame = boxes().every(
    (b, i) =>
      JSON.stringify(rules.computeBoxStandings(b, lb)) ===
      JSON.stringify(legacy.computeBoxStandings(boxes()[i], lb)),
  )
  const oldAfter = legacy.applyLeaderboardUpdate(boxes(), lb)
  const newAfter = rules.applyLeaderboardUpdate(boxes(), lb)

  const notes: string[] = []
  if (!complete || !legacy.allScoresComplete(boxes()))
    notes.push('not all scores complete')
  if (!standingsSame) notes.push('standings differ old vs new')
  const dNew = firstDiff(newAfter, oldAfter)
  if (dNew) notes.push(`new vs old ladder differs ${dNew}`)
  if (!stored) notes.push('no stored ladder-after')
  else {
    const d = firstDiff(newAfter, stored)
    if (d) notes.push(`differs from stored ladder ${d}`)
  }
  if (notOnLadder.length)
    notes.push(`not on ladder-before: ${notOnLadder.join(', ')}`)
  if (notes.length) problems++
  console.log(
    `${date} ${status} boxes=${s.boxes.map((b) => b.players.length).join('+')} ${notes.length ? 'ISSUES: ' + notes.join('; ') : 'OK (old = new = stored)'}`,
  )
}
console.log(
  problems
    ? `\n${problems} session(s) with issues`
    : '\nAll sessions reproduce exactly.',
)
process.exitCode = problems ? 1 : 0
