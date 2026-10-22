// Dev helper: the live channel losing its connection mid-entry, on staging.
// Window A goes offline, a score is typed, the banner shows; back online, the
// score is sent and saved, the banner clears, and window B shows the score.
// Then a quiet connection dies (nothing typed): the heartbeat notices.
// Usage: node live-offline.mjs   (password from e2e/.env.staging)
import { chromium } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
const envFile = new URL('./.env.staging', import.meta.url)
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ??
  (existsSync(envFile) && readFileSync(envFile, 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)?.[1].trim())
const DATE = '2099-01-27'
const PAIRS4 = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]

let fails = 0
const check = (label, ok, detail = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`)
}
const browser = await chromium.launch()
async function signedIn() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: 'test-admin@staging.invalid', password: PASSWORD },
    headers: { origin: BASE },
  })
  return ctx
}
const api = async (ctx, method, path, data) => {
  const r = await ctx.request.fetch(BASE + path, { method, data, headers: { origin: BASE } })
  return { status: r.status(), body: await r.json().catch(() => null) }
}

const setup = await signedIn()
if ((await api(setup, 'GET', `/api/sessions/${DATE}`)).status === 200) await api(setup, 'DELETE', `/api/sessions/${DATE}`)
const four = (await api(setup, 'GET', '/api/leaderboard')).body.players.slice(0, 4).map((p) => p.id)
await api(setup, 'POST', '/api/sessions', { date: DATE })
for (const id of four) await api(setup, 'PUT', `/api/sessions/${DATE}/attendance`, { player_id: id, attending: true })
await api(setup, 'PUT', `/api/sessions/${DATE}/boxes`, {
  boxes: [{ players: four, matches: PAIRS4.map(([pair1, pair2]) => ({ pair1, pair2, sets: [] })), finalPlacings: null }],
})

const A = await signedIn()
const pageA = await A.newPage()
await pageA.goto(`${BASE}/#/${DATE}/games`, { waitUntil: 'networkidle' })
const B = await browser.newContext() // a viewer, not signed in
const pageB = await B.newPage()
await pageB.goto(`${BASE}/#/${DATE}/games`, { waitUntil: 'networkidle' })
await pageA.waitForSelector('.score-input')
await pageB.waitForSelector('.score-input')
const banner = (p) => p.locator('text=Connection lost').isVisible()

// Offline: new connections fail. Chrome's offline mode leaves an open
// WebSocket up, so also drop the one the page has.
await A.setOffline(true)
await pageA.evaluate(() => document.querySelector('[x-data]')._x_dataStack[0]._live.ws.close())
const input = pageA.locator('.score-input:visible').first()
await input.click()
await input.pressSequentially('21', { delay: 60 })
await pageA.locator('.score-input:visible').nth(1).click()
await pageA.locator('.score-input:visible').nth(1).pressSequentially('12', { delay: 60 })
await pageA.waitForTimeout(4000)
check('offline: banner "Connection lost – reconnecting…"', await banner(pageA))
check('offline: typed score still shown', (await pageA.locator('.score-input:visible').first().inputValue()) === '21')

await A.setOffline(false)
let saved = null
for (let i = 0; i < 30 && !(saved && saved[0] === 21 && saved[1] === 12); i++) {
  await pageA.waitForTimeout(1000)
  saved = (await api(setup, 'GET', `/api/sessions/${DATE}`)).body.boxes[0].matches[0].sets[0] ?? null
}
check('back online: the score is sent and saved', saved?.[0] === 21 && saved?.[1] === 12, JSON.stringify(saved))
await pageA.waitForTimeout(1500)
check('back online: banner gone', !(await banner(pageA)))
const shownB = await pageB.locator('.score-input:visible').evaluateAll((els) => els.slice(0, 2).map((e) => e.value))
check('viewer sees it', shownB[0] === '21' && shownB[1] === '12', JSON.stringify(shownB))

// A quiet connection dying (nothing typed): only the heartbeat notices.
await A.setOffline(true)
await pageA.evaluate(() => document.querySelector('[x-data]')._x_dataStack[0]._live.ws.close())
let seenAt = null
const t0 = Date.now()
while (Date.now() - t0 < 40000 && seenAt === null) {
  await pageA.waitForTimeout(1000)
  if (await banner(pageA)) seenAt = Math.round((Date.now() - t0) / 1000)
}
check(`quiet connection lost: banner within 35 s (${seenAt ?? 'never'} s)`, seenAt !== null && seenAt <= 35)
await A.setOffline(false)
await pageA.waitForTimeout(12000)
check('quiet connection back: no banner (nothing was refused)', !(await pageA.locator('text=Connection lost').isVisible()) && !(await pageA.locator('text=Some changes may not').isVisible()))

await api(setup, 'DELETE', `/api/sessions/${DATE}`)
await browser.close()
console.log(fails ? `\n${fails} failed` : '\nAll offline checks passed.')
process.exitCode = fails ? 1 : 0
