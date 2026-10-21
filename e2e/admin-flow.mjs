// Dev helper: run a whole admin session night on staging through the API,
// signed in as the staging Test Admin, checking each step; then delete the
// session and check the ladder and sessions list are back as they were.
// Usage: node admin-flow.mjs   (BASE= to change; password from e2e/.env.staging)
import { existsSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

const BASE = process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
const envFile = new URL('./.env.staging', import.meta.url)
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ??
  (existsSync(envFile) && readFileSync(envFile, 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)?.[1].trim())
const DATE = '2099-01-06' // far future: never a real session

// Pairings per box size (0-based positions), as on the printed score sheets.
const PAIRINGS = {
  4: [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]],
  5: [[[0, 1], [2, 4]], [[2, 3], [1, 4]], [[0, 2], [3, 4]], [[0, 3], [1, 2]], [[0, 4], [1, 3]]],
}

let cookie = ''
let failures = 0
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const set = res.headers.getSetCookie()
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json }
}
function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? `\n      ${detail}` : ''}`)
}
const expectStatus = async (label, method, path, body, status = 200) => {
  const r = await call(method, path, body)
  check(`${label} → ${r.status}`, r.status === status, JSON.stringify(r.body).slice(0, 200))
  return r
}
const withoutDate = (lb) => ({ ...lb, updatedAt: undefined })

if (!PASSWORD) throw new Error('No TEST_LOGIN_PASSWORD (env or e2e/.env.staging)')

const signIn = await call('POST', '/api/auth/sign-in/email', { email: 'test-admin@staging.invalid', password: PASSWORD })
check('sign in as Test Admin', signIn.status === 200 && cookie.includes('session_token'))

const ladderBefore = (await call('GET', '/api/leaderboard')).body
const sessionsBefore = (await call('GET', '/api/sessions')).body
const existing = await call('GET', `/api/sessions/${DATE}`)
if (existing.status === 200) await call('DELETE', `/api/sessions/${DATE}`) // leftover from a failed run

await expectStatus('create session', 'POST', '/api/sessions', { date: DATE }, 201)
const nine = ladderBefore.players.slice(0, 9).map((p) => p.id)
for (const id of nine) await call('PUT', `/api/sessions/${DATE}/attendance`, { player_id: id, attending: true })
let s = (await call('GET', `/api/sessions/${DATE}`)).body
check('9 attending, in ladder order', isDeepStrictEqual(s.attendees.map((p) => p.id), nine))

const boxes = [nine.slice(0, 4), nine.slice(4)].map((players) => ({
  players,
  matches: PAIRINGS[players.length].map(([pair1, pair2]) => ({ pair1, pair2, sets: [] })),
  finalPlacings: null,
}))
await expectStatus('assign boxes (4 + 5)', 'PUT', `/api/sessions/${DATE}/boxes`, { boxes })
for (let b = 0; b < 2; b++) {
  for (let m = 0; m < boxes[b].matches.length; m++) {
    await call('PUT', `/api/sessions/${DATE}/score`, { box_number: b, match_number: m, set_number: 0, score_a: 21, score_b: 10 + m })
    await call('PUT', `/api/sessions/${DATE}/score`, { box_number: b, match_number: m, set_number: 1, score_a: 21, score_b: 15 })
  }
}
await call('PUT', `/api/sessions/${DATE}/score`, { box_number: 1, match_number: 4, set_number: 1, score_a: null, score_b: null })
s = (await call('GET', `/api/sessions/${DATE}`)).body
check('status games', s.status === 'games', s.status)
check('boxes as assigned', isDeepStrictEqual(s.boxes.map((b) => b.players.map((p) => p.id)), [nine.slice(0, 4), nine.slice(4)]))
check(
  'scores as entered (one set cleared)',
  isDeepStrictEqual(s.boxes.map((b) => b.matches.map((m) => m.sets.length)), [[2, 2, 2], [2, 2, 2, 2, 1]]) &&
    s.boxes[0].matches[1].sets[0][1] === 11,
  JSON.stringify(s.boxes.map((b) => b.matches.map((m) => m.sets))),
)

await expectStatus('re-open attendance', 'POST', `/api/sessions/${DATE}/reopen-attendance`)
s = (await call('GET', `/api/sessions/${DATE}`)).body
check('boxes cleared, back to attendance', s.status === 'attendance' && s.boxes.length === 0)
await expectStatus('assign again', 'PUT', `/api/sessions/${DATE}/boxes`, { boxes })
const after = [...nine].reverse().concat(ladderBefore.players.slice(9).map((p) => p.id))
await expectStatus('close', 'POST', `/api/sessions/${DATE}/close`, { leaderboard_after: after })
s = (await call('GET', `/api/sessions/${DATE}`)).body
check('closed with the new ladder', s.status === 'closed' && isDeepStrictEqual(s.leaderboardAfter.map((p) => p.id), after))
await expectStatus('reopen', 'POST', `/api/sessions/${DATE}/reopen`)
await expectStatus('delete session', 'DELETE', `/api/sessions/${DATE}`)

check('ladder back as it was', isDeepStrictEqual(withoutDate((await call('GET', '/api/leaderboard')).body), withoutDate(ladderBefore)))
check('sessions list back as it was', isDeepStrictEqual((await call('GET', '/api/sessions')).body, sessionsBefore))
await call('POST', '/api/auth/sign-out', {})
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed.')
process.exitCode = failures ? 1 : 0
