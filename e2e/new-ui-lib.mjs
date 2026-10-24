// Shared helpers for the new UI's browser checks (UI-PORT.md): a browser,
// sign-in as a staging test account, console-error watching, ok/FAIL lines.
import { chromium } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

export const BASE =
  process.env.BASE ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'
const envFile = new URL('./.env.staging', import.meta.url)
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ??
  (existsSync(envFile) &&
    readFileSync(envFile, 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)?.[1].trim())

let failures = 0
export function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? `\n      ${detail}` : ''}`)
}

/** A browser page (phone: 390px), signed in as `as` if given. */
export async function open({ as, phone = false } = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } },
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
  if (as) {
    if (!PASSWORD) throw new Error('No TEST_LOGIN_PASSWORD (env or e2e/.env.staging)')
    const r = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email: `${as}@staging.invalid`, password: PASSWORD },
      headers: { origin: BASE },
    })
    if (!r.ok()) throw new Error(`sign-in as ${as}: ${r.status()}`)
  }
  return {
    browser,
    page,
    go: (path) => page.goto(BASE + path, { waitUntil: 'networkidle' }),
    /** Console errors so far (and clears them). */
    errors: () => errors.splice(0),
  }
}

export function done(name) {
  console.log(failures ? `\n${failures} check(s) FAILED.` : `\nAll ${name} checks passed.`)
  process.exit(failures ? 1 : 0)
}
