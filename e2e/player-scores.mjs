// Dev helper: players entering their own box's scores (V3), on staging.
// Test Player claims an unlinked player, who goes into box 1 of a temporary
// session: they can type in box 1 (and it saves), not box 2 (the server
// refuses a raw write too); a signed-out viewer can't type at all.
// Cleans up: deletes the session, unlinks the player.
// Usage: node player-scores.mjs   (password from e2e/.env.staging)
import { chromium } from '@playwright/test'
import { SCORE, editable, gamesPath, openBoxes } from './ui-mode.mjs'
import { existsSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
const envFile = new URL('./.env.staging', import.meta.url)
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ??
  (existsSync(envFile) && readFileSync(envFile, 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)?.[1].trim())
const DATE = '2099-02-03'
const PAIRS4 = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]

let fails = 0
const check = (label, ok, detail = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`)
}
const browser = await chromium.launch()
async function signedIn(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: `${who}@staging.invalid`, password: PASSWORD },
    headers: { origin: BASE },
  })
  if (!r.ok()) throw new Error(`sign in as ${who}: ${r.status()}`)
  return ctx
}
const api = async (ctx, method, path, data) => {
  const r = await ctx.request.fetch(BASE + path, { method, data, headers: { origin: BASE } })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const admin = await signedIn('test-admin')
const player = await signedIn('test-player')

// Clean slate: no session on the date; Test Player unlinked.
if ((await api(admin, 'GET', `/api/sessions/${DATE}`)).status === 200) await api(admin, 'DELETE', `/api/sessions/${DATE}`)
const already = (await api(player, 'GET', '/api/me')).body.player
if (already) await api(admin, 'POST', `/api/players/${already.id}/unlink`, {})

// Test Player becomes an unlinked ladder player; they go in box 1.
const claimable = new Set((await api(player, 'GET', '/api/me/claimable')).body.players.map((p) => p.id))
const ladder = (await api(admin, 'GET', '/api/leaderboard')).body.players
const me = ladder.find((p) => claimable.has(p.id))
const claim = await api(player, 'POST', '/api/me/claim', { player_id: me.id })
check(`Test Player is linked to ${me.name}`, claim.status === 200, JSON.stringify(claim.body))
const others = ladder.filter((p) => p.id !== me.id).slice(0, 7).map((p) => p.id)
const box1 = [me.id, ...others.slice(0, 3)]
const box2 = others.slice(3, 7)
await api(admin, 'POST', '/api/sessions', { date: DATE })
for (const id of [...box1, ...box2]) await api(admin, 'PUT', `/api/sessions/${DATE}/attendance`, { player_id: id, attending: true })
await api(admin, 'PUT', `/api/sessions/${DATE}/boxes`, {
  boxes: [box1, box2].map((players) => ({ players, matches: PAIRS4.map(([p1, p2]) => ({ pairs: [p1.map((i) => players[i]), p2.map((i) => players[i])], sets: [] })), finalPlacings: null })),
})

// In the browser: own box editable, the other not; typing saves.
const page = await player.newPage()
await page.goto(BASE + gamesPath(DATE), { waitUntil: 'networkidle' })
await openBoxes(page)
const enabled = await page.locator(`${SCORE}:visible`).evaluateAll(editable)
// Each box of 4: 3 matches × 2 sets × 2 sides = 12 visible inputs.
check('player: box 1 inputs editable', enabled.slice(0, 12).every(Boolean), JSON.stringify(enabled.slice(0, 12)))
check('player: box 2 inputs not editable', enabled.slice(12, 24).every((e) => !e), JSON.stringify(enabled.slice(12, 24)))
const first = page.locator(`${SCORE}:visible`).first()
await first.click()
await first.pressSequentially('21', { delay: 60 })
const second = page.locator(`${SCORE}:visible`).nth(1)
await second.click()
await second.pressSequentially('16', { delay: 60 })
let saved = null
for (let i = 0; i < 10 && !(saved?.[0] === 21 && saved?.[1] === 16); i++) {
  await page.waitForTimeout(500)
  saved = (await api(admin, 'GET', `/api/sessions/${DATE}`)).body.boxes[0].matches[0].sets[0] ?? null
}
check('player: score typed in their box is saved', saved?.[0] === 21 && saved?.[1] === 16, JSON.stringify(saved))
check('player: no warning banner', !(await page.locator('text=Some changes may not').isVisible()))

// The server refuses a write to box 2, whatever the page shows.
const cookie = (await player.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
const reply = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/live/${DATE}`, { headers: { Cookie: cookie } })
  ws.onopen = () => ws.send(JSON.stringify({ type: 'write', id: `v3-check-${Date.now()}`, op: { op: 'setScore', box: 1, match: 0, set: 0, a: 21, b: 0 } }))
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'ack') { ws.close(); resolve(m) } }
  setTimeout(() => resolve(null), 8000)
})
check('server: a write to another box is refused', reply?.ok === false && /own box/.test(reply?.error ?? ''), JSON.stringify(reply))

// A signed-out viewer: nothing editable.
const viewer = await browser.newContext()
const vpage = await viewer.newPage()
await vpage.goto(BASE + gamesPath(DATE), { waitUntil: 'networkidle' })
await openBoxes(vpage)
const viewerEnabled = await vpage.locator(`${SCORE}:visible`).evaluateAll((els, isNew) => els.some((e) => !(isNew ? e.readOnly : e.disabled)), process.env.UI !== 'old')
check('signed-out viewer: nothing editable', !viewerEnabled)

await api(admin, 'DELETE', `/api/sessions/${DATE}`)
await api(admin, 'POST', `/api/players/${me.id}/unlink`, {})
await browser.close()
console.log(fails ? `\n${fails} failed` : '\nAll player score checks passed.')
process.exitCode = fails ? 1 : 0
