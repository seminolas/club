// Dev helper: open pages in a real browser and screenshot them.
// Usage: node shot.mjs <outDir> <json steps>
//   steps (also { "scheme": "dark" } to emulate the device setting): [{ "as": "test-admin" }, { "go": "/#/2026-10-20", "shot": "session", "mobile": true }, { "click": "text=Players" }, ...]
// BASE defaults to staging; set BASE=https://club.vilhelmas-f78.workers.dev for prod (read-only checks only).
// { "as": "test-admin" | "test-player" } signs in as a staging test account
// (password: TEST_LOGIN_PASSWORD in e2e/.env.staging, gitignored); { "signout": true }.
// Ported from club-next/e2e/shot.mjs.
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

// KEY=value lines from e2e/.env.staging, if present.
const envFile = new URL('./.env.staging', import.meta.url)
const localEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^\w+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {}
const PASSWORD = process.env.TEST_LOGIN_PASSWORD ?? localEnv.TEST_LOGIN_PASSWORD

const [, , outDir, stepsJson] = process.argv
const steps = JSON.parse(stepsJson)
const BASE = process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
let context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
})
let page = await context.newPage()
const errors = []
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  p.on(
    'console',
    (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`),
  )
}
watch(page)

for (const s of steps) {
  try {
    if (s.mobile !== undefined) {
      const state = await context.storageState()
      await context.close()
      context = await browser.newContext({
        storageState: state,
        viewport: s.mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: Boolean(s.mobile),
        hasTouch: Boolean(s.mobile),
      })
      page = await context.newPage()
      watch(page)
    }
    if (s.as) {
      const r = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
        data: { email: `${s.as}@staging.invalid`, password: PASSWORD },
        headers: { origin: BASE },
      })
      if (!r.ok()) errors.push(`sign in as ${s.as}: ${r.status()} ${await r.text()}`)
    }
    if (s.signout)
      await page.request.post(`${BASE}/api/auth/sign-out`, {
        data: {},
        headers: { origin: BASE },
      })
    if (s.scheme) await page.emulateMedia({ colorScheme: s.scheme })
    if (s.go) await page.goto(BASE + s.go, { waitUntil: 'networkidle' })
    if (s.click) await page.locator(s.click).first().click()
    if (s.fill) await page.locator(s.fill[0]).first().fill(s.fill[1])
    if (s.press) await page.keyboard.press(s.press)
    if (s.wait) await page.waitForTimeout(s.wait)
    if (s.waitFor)
      await page.locator(s.waitFor).first().waitFor({ timeout: 15000 })
    if (s.shot) {
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `${outDir}/${s.shot}.png`,
        fullPage: s.full !== false,
      })
      console.log(`shot ${s.shot} @ ${page.url()}`)
    }
    if (s.text)
      console.log(
        `text: ${(await page.locator(s.text).first().innerText()).slice(0, 500)}`,
      )
  } catch (e) {
    errors.push(`step ${JSON.stringify(s)}: ${e.message.split('\n')[0]}`)
  }
}
if (errors.length)
  console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'))
await browser.close()
