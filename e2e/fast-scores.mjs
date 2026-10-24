// Dev helper: fast score entry on staging. Window A types every match's
// scores quickly (as an admin does from paper sheets); window B watches. Then
// both windows and the database must show exactly what was typed.
// Answers to session reads arrive late (LATENCY_MS, default 1000) to mimic
// phone data in a sports hall. Uses a far-future session, deleted afterwards.
// Usage: node fast-scores.mjs   (BASE=, LATENCY_MS=; password from e2e/.env.staging)
import { chromium } from '@playwright/test'
import { SCORE, editable, gamesPath, openBoxes } from './ui-mode.mjs'
import { existsSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 1000)
const envFile = new URL('./.env.staging', import.meta.url)
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ??
  (existsSync(envFile) && readFileSync(envFile, 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)?.[1].trim())
const DATE = '2099-01-13'
const PAIRINGS = {
  4: [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]],
  5: [[[0, 1], [2, 4]], [[2, 3], [1, 4]], [[0, 2], [3, 4]], [[0, 3], [1, 2]], [[0, 4], [1, 3]]],
}
// What gets typed into each match: straight sets, so set 3 stays hidden.
const TYPED = [['21', '15'], ['21', '17']]

const browser = await chromium.launch()
async function signedInContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: 'test-admin@staging.invalid', password: PASSWORD },
    headers: { origin: BASE },
  })
  if (!r.ok()) throw new Error(`sign-in failed: ${r.status()}`)
  return ctx
}
const api = async (ctx, method, path, data) => {
  const r = await ctx.request.fetch(BASE + path, { method, data, headers: { origin: BASE } })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

// ── Setup: a session in games with a box of 4 and a box of 5 ────────────────
const setup = await signedInContext()
if ((await api(setup, 'GET', `/api/sessions/${DATE}`)).status === 200) await api(setup, 'DELETE', `/api/sessions/${DATE}`)
const ladder = (await api(setup, 'GET', '/api/leaderboard')).body.players
await api(setup, 'POST', '/api/sessions', { date: DATE })
const nine = ladder.slice(0, 9).map((p) => p.id)
for (const id of nine) await api(setup, 'PUT', `/api/sessions/${DATE}/attendance`, { player_id: id, attending: true })
const boxes = [nine.slice(0, 4), nine.slice(4)].map((players) => ({
  players,
  matches: PAIRINGS[players.length].map(([pair1, pair2]) => ({ pair1, pair2, sets: [] })),
  finalPlacings: null,
}))
const assigned = await api(setup, 'PUT', `/api/sessions/${DATE}/boxes`, { boxes })
if (assigned.status !== 200) throw new Error(`assign boxes: ${assigned.status}`)
const matchCount = boxes.reduce((n, b) => n + b.matches.length, 0)

// ── Two windows on the games tab ────────────────────────────────────────────
async function openWindow() {
  const ctx = await signedInContext()
  const page = await ctx.newPage()
  // Slow reads of this session, like a phone on poor data: the server answers
  // straight away, the answer arrives LATENCY_MS later.
  // (The new UI reads through its server functions.)
  await page.route(process.env.UI !== 'old' ? '**/_serverFn/**' : `**/api/sessions/${DATE}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    try {
      const response = await route.fetch()
      await new Promise((r) => setTimeout(r, LATENCY_MS))
      await route.fulfill({ response })
    } catch {
      // the window closed meanwhile
    }
  })
  await page.goto(BASE + gamesPath(DATE), { waitUntil: 'networkidle' })
  await openBoxes(page)
  return { ctx, page }
}
const A = await openWindow()
const B = await openWindow()

const visibleInputs = (page) => page.locator(`${SCORE}:visible`)
const readValues = (page) => visibleInputs(page).evaluateAll((els) => els.map((e) => e.value))

// Type each match's two sets, character by character, tabbing between boxes.
const expected = []
const started = Date.now()
for (let m = 0; m < matchCount; m++) {
  for (const [a, b] of TYPED) {
    for (const value of [a, b]) {
      const index = expected.length
      const input = visibleInputs(A.page).nth(index)
      await input.click()
      await input.pressSequentially(value, { delay: 70 })
      expected.push(value)
      await A.page.waitForTimeout(120)
    }
  }
}
const typingSeconds = ((Date.now() - started) / 1000).toFixed(1)

// Let saves and the next reads land, then compare.
await A.page.waitForTimeout(8000)
const shownA = await readValues(A.page)
const shownB = await readValues(B.page)
const saved = (await api(setup, 'GET', `/api/sessions/${DATE}`)).body.boxes
  .flatMap((b) => b.matches.flatMap((m) => m.sets.slice(0, 2).flatMap((s) => s.map(String))))

const diffs = (label, actual) => {
  const wrong = expected.map((v, i) => (actual[i] === v ? null : `#${i + 1}: typed ${v}, shows ${actual[i] ?? '(nothing)'}`)).filter(Boolean)
  console.log(`${wrong.length ? 'FAIL' : 'ok  '}  ${label}: ${expected.length - wrong.length}/${expected.length} as typed${wrong.length ? `\n      ${wrong.slice(0, 8).join('\n      ')}` : ''}`)
  return wrong.length
}
console.log(`typed ${expected.length} scores across ${matchCount} matches in ${typingSeconds}s (reads delayed ${LATENCY_MS} ms)`)
const failures = diffs('window A (typing)', shownA) + diffs('window B (watching)', shownB) + diffs('database', saved)

await api(setup, 'DELETE', `/api/sessions/${DATE}`)
await browser.close()
console.log(failures ? '\nScores were lost or reverted.' : '\nAll scores stuck everywhere.')
process.exitCode = failures ? 1 : 0
