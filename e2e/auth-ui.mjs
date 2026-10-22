// Dev helper: browser checks of sign-in on staging (signed out -> Google,
// Test Admin UI + sign out, "This is me" + admin unlink, no skipping the
// box, failed sign-in).
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
const signedInAs = async (page) => (await page.locator('[data-test=signed-in-as]').innerText().catch(() => '')).trim()

// 1. Signed out → Sign in → Google
{
  const { ctx, page } = await fresh()
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('signed out: header shows "Sign in", no Admin pill', await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible() && !(await page.getByText('Admin', { exact: true }).isVisible()))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const btn = page.getByRole('button', { name: 'Sign in with Google' })
  check('modal shows "Sign in with Google"', await btn.waitFor({ timeout: 5000 }).then(() => true, () => false))
  await Promise.all([page.waitForURL(/accounts\.google\.com/, { timeout: 15000 }).catch(() => {}), btn.click()])
  check('clicking it goes to Google', page.url().startsWith('https://accounts.google.com/'), page.url().slice(0, 80))
  await ctx.close()
}
// 2. Test Admin: admin UI, admin-only page, logout
{
  const { ctx, page } = await fresh()
  check('test admin signs in', (await signIn(page, 'test-admin')).ok())
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('admin (linked to their player): not asked "Which player are you?"', !(await page.getByText('Which player are you?').isVisible()))
  check('admin: header shows Admin, "Signed in as Test" and Sign out', await page.getByText('Admin', { exact: true }).isVisible() && (await signedInAs(page)) === 'Signed in as Test' && await page.locator('[data-test=signed-in-as]').locator('xpath=..').getByRole('button', { name: 'Sign out' }).isVisible())
  await page.goto(BASE + '/#/players/30', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  check('admin-only player page stays open', page.url().includes('/players/30'), page.url())
  await page.locator('[data-test=signed-in-as]').locator('xpath=..').getByRole('button', { name: 'Sign out' }).click()
  await page.waitForTimeout(800)
  check('sign out: back to "Sign in", session ended', await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible() && !(await me(page)).signedIn)
  await ctx.close()
}
// 3. A player with no link picks themselves ("This is me"); the admin then sees
//    the link on that player's page and unlinks it (leaving staging as it was).
{
  // Clean up a link left by an earlier, interrupted run.
  {
    const p = await fresh()
    await signIn(p.page, 'test-player')
    const linked = (await me(p.page)).player
    await p.ctx.close()
    if (linked) {
      const a = await fresh()
      await signIn(a.page, 'test-admin')
      await a.page.request.post(`${BASE}/api/players/${linked.id}/unlink`, { data: {}, headers: { origin: BASE } })
      await a.ctx.close()
    }
  }
  const { ctx, page } = await fresh()
  await signIn(page, 'test-player')
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('player: "Which player are you?" offered', await page.getByText('Which player are you?').isVisible())
  const claimable = await (await page.request.get(`${BASE}/api/me/claimable`)).json()
  const pick = claimable.players[Math.floor(claimable.players.length / 2)]
  await page.getByPlaceholder('Search names').fill(pick.name)
  await page.getByRole('button', { name: pick.name, exact: true }).click()
  await page.getByRole('button', { name: 'This is me' }).click()
  await page.waitForTimeout(800)
  const first = pick.name.trim().split(/\s+/)[0]
  check(`player: linked to ${pick.name}, header "Signed in as ${first}", no Admin pill`, (await me(page)).player?.id === pick.id && (await signedInAs(page)) === `Signed in as ${first}` && !(await page.getByText('Admin', { exact: true }).isVisible()))
  await page.reload({ waitUntil: 'networkidle' })
  check('player: not asked again once linked', !(await page.getByText('Which player are you?').isVisible()))
  await ctx.close()

  const admin = await fresh()
  await signIn(admin.page, 'test-admin')
  await admin.page.goto(BASE + `/#/players/${pick.id}`, { waitUntil: 'networkidle' })
  await admin.page.waitForTimeout(500)
  check('admin: player page shows the Google sign-in', await admin.page.getByText('Google: test-player@staging.invalid').isVisible())
  admin.page.once('dialog', (d) => d.accept())
  await admin.page.getByRole('button', { name: 'Unlink' }).click()
  await admin.page.waitForTimeout(800)
  check('admin: Unlink removes it', await admin.page.getByText('Not linked').isVisible() && (await (await admin.page.request.get(`${BASE}/api/players/${pick.id}`)).json()).login === null)
  await admin.ctx.close()
}
// 4. "Which player are you?" can't be skipped: no "Not now", only Sign out.
{
  const { ctx, page } = await fresh()
  await signIn(page, 'test-player')
  await page.goto(BASE + '/#/players', { waitUntil: 'networkidle' })
  check('no player: box offers "New here?" and Sign out, no "Not now"', await page.getByText('New here? For now, an admin needs to add you.').isVisible() && !(await page.getByRole('button', { name: 'Not now' }).count()))
  await page.locator('div.fixed').filter({ hasText: 'Which player are you?' }).getByRole('button', { name: 'Sign out' }).click()
  await page.waitForTimeout(800)
  check('Sign out from the box: signed out, box gone', !(await me(page)).signedIn && !(await page.getByText('Which player are you?').isVisible()))
  await ctx.close()
}
// 5. A failed sign-in (?error=) shows a message and cleans the URL
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
