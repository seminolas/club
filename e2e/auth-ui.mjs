// Dev helper: browser checks of sign-in on staging (signed out -> Google,
// Test Admin UI + sign out, "Which player are you?" + admin unlink, no
// skipping the box, failed sign-in), on the current UI.
// Usage: node auth-ui.mjs   (password from e2e/.env.staging)
import { BASE, check, done, open } from './new-ui-lib.mjs'

const me = async (page) => (await page.request.get(`${BASE}/api/me`)).json()
const signedInAs = async (page) =>
  (await page.locator('[data-test=signed-in-as]').innerText().catch(() => '')).trim()
const signOutFromMenu = async (page) => {
  await page.locator('[data-test=user-menu]').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForTimeout(800)
}
const allErrors = []
const keep = (s) => allErrors.push(...s.errors().filter((e) => !/401|Unauthorized/.test(e)))

// 1. Signed out → Sign in → Google
{
  const s = await open()
  await s.go('/players')
  check('signed out: header shows "Sign in", no account menu', (await s.page.getByRole('button', { name: 'Sign in', exact: true }).isVisible()) && !(await s.page.locator('[data-test=user-menu]').count()))
  await s.page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const btn = s.page.getByRole('button', { name: 'Sign in with Google' })
  check('modal shows "Sign in with Google"', await btn.waitFor({ timeout: 5000 }).then(() => true, () => false))
  await Promise.all([s.page.waitForURL(/accounts\.google\.com/, { timeout: 15000 }).catch(() => {}), btn.click()])
  check('clicking it goes to Google', s.page.url().startsWith('https://accounts.google.com/'), s.page.url().slice(0, 80))
  keep(s)
  await s.browser.close()
}
// 2. Test Admin: account menu with Admin, admin-only page, sign out
{
  const s = await open({ as: 'test-admin' })
  await s.go('/players')
  check('admin (linked to their player): not asked "Which player are you?"', !(await s.page.getByText('Which player are you?').isVisible()))
  check('admin: header "Signed in as Test"', (await signedInAs(s.page)) === 'Signed in as Test', await signedInAs(s.page))
  await s.page.locator('[data-test=user-menu]').click()
  await s.page.getByRole('menuitem', { name: 'Sign out' }).waitFor()
  check('admin: the menu shows Admin, Light / Dark and Sign out', (await s.page.getByText('Admin', { exact: true }).isVisible()) && (await s.page.getByText('Dark', { exact: true }).isVisible()) && (await s.page.getByRole('menuitem', { name: 'Sign out' }).isVisible()))
  await s.page.keyboard.press('Escape')
  const id = (await (await s.page.request.get(`${BASE}/api/leaderboard`)).json()).players[0].id
  await s.go(`/players/${id}`)
  check('admin-only player page stays open', s.page.url().endsWith(`/players/${id}`), s.page.url())
  await signOutFromMenu(s.page)
  check('sign out: back to "Sign in", session ended', (await s.page.getByRole('button', { name: 'Sign in', exact: true }).isVisible()) && !(await me(s.page)).signedIn)
  keep(s)
  await s.browser.close()
}
// 3. A player with no link picks themselves ("This is me"); the admin then sees
//    the link on that player's page and unlinks it (leaving staging as it was).
{
  // Start unlinked (an earlier run, or player-scores.mjs, may have linked it).
  {
    const p = await open({ as: 'test-player' })
    const linked = (await me(p.page)).player
    await p.browser.close()
    if (linked) {
      const a = await open({ as: 'test-admin' })
      await a.page.request.post(`${BASE}/api/players/${linked.id}/unlink`, { data: {}, headers: { origin: BASE } })
      await a.browser.close()
    }
  }
  const s = await open({ as: 'test-player' })
  await s.go('/players')
  const dialog = s.page.getByRole('dialog')
  check('player: "Which player are you?" offered', await dialog.getByText('Which player are you?').isVisible())
  const claimable = (await (await s.page.request.get(`${BASE}/api/me/claimable`)).json()).players
  const pick = claimable[Math.floor(claimable.length / 2)]
  await dialog.getByPlaceholder('Search names').fill(pick.name)
  await dialog.getByRole('button', { name: pick.name, exact: true }).click()
  await dialog.getByRole('button', { name: 'This is me' }).click()
  await s.page.waitForTimeout(1200)
  const first = pick.name.trim().split(/\s+/)[0]
  check(`player: linked to ${pick.name}, header "Signed in as ${first}"`, (await me(s.page)).player?.id === pick.id && (await signedInAs(s.page)) === `Signed in as ${first}`, await signedInAs(s.page))
  await s.page.reload({ waitUntil: 'networkidle' })
  check('player: not asked again once linked', !(await s.page.getByText('Which player are you?').isVisible()))
  keep(s)
  await s.browser.close()

  const a = await open({ as: 'test-admin' })
  await a.go(`/players/${pick.id}`)
  check('admin: player page shows the Google sign-in', await a.page.getByText('Google: test-player@staging.invalid').isVisible())
  await a.page.getByRole('button', { name: 'Unlink' }).click()
  await a.page.getByRole('dialog').getByRole('button', { name: 'Unlink' }).click()
  await a.page.waitForTimeout(1200)
  check('admin: Unlink removes it', (await a.page.getByText('Not linked').isVisible()) && (await (await a.page.request.get(`${BASE}/api/players/${pick.id}`)).json()).login === null)
  keep(a)
  await a.browser.close()
}
// 4. "Which player are you?" can't be skipped: no close button, only Sign out.
{
  const s = await open({ as: 'test-player' })
  await s.go('/players')
  const dialog = s.page.getByRole('dialog')
  check('no player: box offers "New here?" and Sign out, no way to close it', (await dialog.getByText('New here? For now, an admin needs to add you.').isVisible()) && !(await dialog.getByRole('button', { name: /close/i }).count()))
  await s.page.keyboard.press('Escape')
  check('Escape doesn\'t close it', await dialog.getByText('Which player are you?').isVisible())
  await dialog.getByRole('button', { name: 'Sign out' }).click()
  await s.page.waitForTimeout(1200)
  check('Sign out from the box: signed out, box gone', !(await me(s.page)).signedIn && !(await s.page.getByText('Which player are you?').isVisible()))
  keep(s)
  await s.browser.close()
}
// 5. A failed sign-in (?error=) shows a message and cleans the URL
{
  const s = await open()
  await s.go('/players?error=access_denied')
  check('error: message shown', await s.page.getByText('Sign-in didn’t complete').isVisible())
  check('error: URL cleaned', !s.page.url().includes('error='), s.page.url())
  keep(s)
  await s.browser.close()
}
check('no console errors', allErrors.length === 0, allErrors.slice(0, 3).join(' | '))
done('sign-in UI')
