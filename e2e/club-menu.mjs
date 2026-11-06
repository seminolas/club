// The header's club menu (MULTI-CLUB.md) on staging: switching keeps the
// landing tab, a detail page switches to the club's Players, the device
// remembers its club (/ opens it), and on a phone the trail shows the house
// alone. Needs a second club (e.g. juniors) on staging.
// Usage: node club-menu.mjs
import { check, done, open } from './new-ui-lib.mjs'

const s = await open()
const { page } = s
const menu = page.locator('[data-test=club-menu]')
const path = () => new URL(page.url()).pathname

await s.go('/seniors/sessions')
check('the menu shows the club', (await menu.textContent())?.includes('Seniors'))
await menu.click()
const items = page.getByRole('menuitem')
check('it lists the clubs', (await items.count()) >= 2, String(await items.count()))
check(
  'the current club is marked',
  (await page.getByRole('menuitem', { name: /Seniors/ }).getAttribute('aria-current')) === 'page',
)
await page.getByRole('menuitem', { name: /Juniors/ }).click()
await page.waitForURL('**/juniors/sessions')
check('switching keeps the tab', path() === '/juniors/sessions', path())
check('the menu now says Juniors', (await menu.textContent())?.includes('Juniors'))

await s.go('/')
check('/ opens the remembered club', path() === '/juniors/players', path())

// A detail page: the club's Players.
const sessions = await (await page.request.get(`${new URL(page.url()).origin}/api/sessions`)).json()
const closed = sessions.find((x) => x.status === 'closed')?.date
await s.go(`/seniors/sessions/${closed}/results`)
await menu.click()
await page.getByRole('menuitem', { name: /Juniors/ }).click()
await page.waitForURL('**/juniors/players')
check('from a detail page: the other club’s Players', path() === '/juniors/players', path())
check('no console errors (desktop)', s.errors().length === 0, s.errors().join('\n'))
await s.browser.close()

const p = await open({ phone: true })
await p.go(`/seniors/sessions/${closed}/results`)
check('phone, in a trail: the house alone', !(await p.page.locator('[data-test=club-menu]').isVisible()))
await p.go('/seniors/players')
check('phone, landing: the menu shows', await p.page.locator('[data-test=club-menu]').isVisible())
const wide = await p.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
check('phone: no sideways scroll', !wide)
check('no console errors (phone)', p.errors().length === 0, p.errors().join('\n'))
await p.browser.close()

done('club menu')
