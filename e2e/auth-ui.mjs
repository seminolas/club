// Dev helper: browser checks of sign-in on staging (signed out -> Google,
// Test Admin UI + logout, non-admin turned away, failed sign-in message).
// Usage: node auth-ui.mjs   (password from e2e/.env.staging)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const BASE = 'https://club-api-staging.vilhelmas-f78.workers.dev'
const PW = readFileSync(new URL('./.env.staging', import.meta.url), 'utf8').match(/TEST_LOGIN_PASSWORD=(.*)/)[1].trim()
const browser = await chromium.launch()
const errors = []
let fails = 0
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ' — ' + detail : ''}`) }
async function fresh() {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return { ctx, page }
}
const signIn = (page, id) => page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: `${id}@staging.invalid`, password: PW }, headers: { origin: BASE } })
const me = async (page) => (await page.request.get(`${BASE}/api/me`)).json()

// 1. Signed out → Sign in → Google
{
  const { ctx, page } = await fresh()
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('signed out: header shows "Sign in", no Admin pill', await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible() && !(await page.getByText('Admin', { exact: true }).isVisible()))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const btn = page.getByRole('button', { name: 'Sign in with Google' })
  check('modal shows "Sign in with Google"', await btn.isVisible())
  await Promise.all([page.waitForURL(/accounts\.google\.com/, { timeout: 15000 }).catch(() => {}), btn.click()])
  check('clicking it goes to Google', page.url().startsWith('https://accounts.google.com/'), page.url().slice(0, 80))
  await ctx.close()
}
// 2. Test Admin: admin UI, admin-only page, logout
{
  const { ctx, page } = await fresh()
  check('test admin signs in', (await signIn(page, 'test-admin')).ok())
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('admin: header shows Admin + Logout', await page.getByText('Admin', { exact: true }).isVisible() && await page.getByRole('button', { name: 'Logout' }).isVisible())
  await page.goto(BASE + '/#/players/30', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  check('admin-only player page stays open', page.url().includes('/players/30'), page.url())
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForTimeout(800)
  check('logout: back to "Sign in", session ended', await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible() && !(await me(page)).signedIn)
  await ctx.close()
}
// 3. Non-admin coming back from Google: signed out again, with a message
{
  const { ctx, page } = await fresh()
  await signIn(page, 'test-player')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.evaluate(() => sessionStorage.setItem('signingIn', '1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  check('non-admin: message shown', await page.getByText('isn’t an admin here').isVisible())
  check('non-admin: signed out again, no Admin pill', !(await me(page)).signedIn && !(await page.getByText('Admin', { exact: true }).isVisible()))
  await ctx.close()
}
// 4. A failed sign-in (?error=) shows a message and cleans the URL
{
  const { ctx, page } = await fresh()
  await page.goto(BASE + '/?error=access_denied#/players', { waitUntil: 'networkidle' })
  check('error: message shown', await page.getByText('Sign-in didn’t complete').isVisible())
  check('error: URL cleaned', !page.url().includes('error='), page.url())
  await ctx.close()
}
const relevant = errors.filter((e) => !/401|Unauthorized/.test(e))
check('no console errors', relevant.length === 0, relevant.slice(0, 3).join(' | '))
await browser.close()
console.log(fails ? `\n${fails} failed` : '\nAll UI checks passed.')
