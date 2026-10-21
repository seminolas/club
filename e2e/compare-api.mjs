// Dev helper: fetch every public API response from two deployments and require
// identical JSON (config, ladder, sessions list, every session in full).
// Usage: node compare-api.mjs   (A = prod, B = staging; set A= / B= to change)
// Run right after a staging refresh, so both hold the same data.
import { isDeepStrictEqual } from 'node:util'

const A = process.env.A ?? 'https://club.vilhelmas-f78.workers.dev'
const B = process.env.B ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'

async function get(base, path) {
  const res = await fetch(base + path)
  const body = await res.json()
  // Generated per request, not data.
  if (path === '/api/leaderboard') delete body.updatedAt
  if (path === '/api/config') delete body.googleClientId
  return { status: res.status, body }
}

function firstDifference(a, b, path = '') {
  if (isDeepStrictEqual(a, b)) return null
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || '(root)'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDifference(a[k], b[k], `${path}.${k}`)
    if (d) return d
  }
  return `${path}: differs`
}

const list = await get(A, '/api/sessions')
const paths = [
  '/api/config',
  '/api/leaderboard',
  '/api/sessions',
  ...list.body.map((s) => `/api/sessions/${s.date}`),
  '/api/sessions/1999-01-01',
]

let differing = 0
for (const path of paths) {
  const [a, b] = await Promise.all([get(A, path), get(B, path)])
  const diff = firstDifference(a, b)
  if (diff) differing++
  console.log(`${diff ? 'DIFF' : 'same'}  ${path}${diff ? `\n      ${diff}` : ''}`)
}
console.log(differing ? `\n${differing} of ${paths.length} responses differ` : `\nAll ${paths.length} responses identical.`)
process.exitCode = differing ? 1 : 0
