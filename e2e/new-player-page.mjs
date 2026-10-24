// The new UI's player page (UI-PORT.md, U3) on staging: admins open it from
// the ladder, edit a display name (then put it back), see HelloClub search;
// players are sent back to the ladder.
// Usage: node new-player-page.mjs
import { BASE, check, done, open } from './new-ui-lib.mjs'

const admin = await open({ as: 'test-admin' })
const { page } = admin
await admin.go('/new/players')
await page.locator('[role=combobox]').fill('a')
await page.keyboard.press('Enter')
await page.waitForURL(/\/new\/players\/\d+$/)
const id = page.url().match(/(\d+)$/)[1]
check('Enter on the ladder opens the first match\'s page', !!id)
const name = (await page.locator('.club-page-card').first().innerText()).split('\n')[0]
const before = await (await page.request.get(`${BASE}/api/players/${id}`)).json()
check('the card shows the player', name === before.name, `${name} vs ${before.name}`)

await page.getByRole('button', { name: 'Edit' }).click()
await page.getByLabel('Display name').fill('Zz Check')
await page.getByRole('button', { name: 'Save' }).click()
await page.getByText('Profile saved.').waitFor()
let now = await (await page.request.get(`${BASE}/api/players/${id}`)).json()
check('Save stores the display name', now.preferred_name === 'Zz Check')
await page.getByRole('button', { name: 'Edit' }).click()
await page.getByLabel('Display name').fill(before.preferred_name ?? '')
await page.getByLabel('Display name').press('Enter')
await page.getByText('Profile saved.').first().waitFor()
await page.waitForTimeout(500)
now = await (await page.request.get(`${BASE}/api/players/${id}`)).json()
check('…and puts it back', JSON.stringify(now) === JSON.stringify(before), JSON.stringify(now))

await page.getByRole('button', { name: 'Find in HelloClub' }).click()
await page.getByRole('dialog').getByText(/HC API error|No active members|Select/).first().waitFor({ timeout: 15000 })
check('Find in HelloClub searches (staging: HelloClub refuses the fake key)', true)
check('no console errors (admin)', admin.errors().length === 0, admin.errors().join('\n'))
await admin.browser.close()

const player = await open({ as: 'test-player' })
await player.go(`/new/players/${id}`)
check('a player is sent back to the ladder', player.page.url().endsWith('/new/players'), player.page.url())
await player.browser.close()
done('player page')
