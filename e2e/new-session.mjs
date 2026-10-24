// The new UI's session page (UI-PORT.md, U4–) on staging, as Test Admin, on a
// throwaway session far in the future: check-in by search + Enter, Undo,
// adding a new player, Assign boxes, Re-open check-in (previous layout first),
// then Delete. Cleans up after itself (session and added player).
// Usage: node new-session.mjs
import { BASE, check, done, open } from './new-ui-lib.mjs'

const DATE = '2099-01-13'
const NEW_NAME = 'Zz New Player Check'
const admin = await open({ as: 'test-admin' })
const { page } = admin
const api = async (method, path, data) => {
  const r = await page.request.fetch(BASE + path, {
    method,
    data,
    headers: { origin: BASE },
  })
  return { status: r.status(), body: await r.json().catch(() => null) }
}
const sessionNow = async () => (await api('GET', `/api/sessions/${DATE}`)).body

// Clean slate.
if ((await api('GET', `/api/sessions/${DATE}`)).status === 200)
  await api('DELETE', `/api/sessions/${DATE}`)
const ladder = (await api('GET', '/api/leaderboard')).body.players
check('create session (API)', (await api('POST', '/api/sessions', { date: DATE })).status === 201)

await admin.go(`/new/sessions/${DATE}`)
check('opens at Check-in', page.url().endsWith(`/new/sessions/${DATE}/checkin`), page.url())
const search = page.locator('[role=combobox]').first()
const card = page.locator('.lt-actions').first()
check('card: Check-in open, Coming: 0', /Check-in open/.test(await card.innerText()) && /Coming:\s*0/.test(await card.innerText()))

// Mark 9 players by name + Enter (players ranked 1–9 who still exist).
const nine = ladder.slice(0, 9)
for (const p of nine) {
  await search.fill(p.name)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1500)
let s = await sessionNow()
check('Enter marks 9 coming', s.attendees.length === 9, JSON.stringify(s.attendees.map((a) => a.name)))
check('the search clears after each', (await search.inputValue()) === '')
check('card counts them', /Coming:\s*9/.test(await card.innerText()))

// Unmark the 9th, then Undo.
await search.fill(nine[8].name)
await page.keyboard.press('Enter')
await page.getByText(/is no longer coming/).first().waitFor()
await page.waitForTimeout(800)
check('Enter again unmarks', (await sessionNow()).attendees.length === 8)
await page
  .locator('.mantine-Notification-root', { hasText: 'is no longer coming' })
  .getByRole('button', { name: 'Undo' })
  .click()
await page.waitForTimeout(1500)
check('Undo marks them again', (await sessionNow()).attendees.length === 9)

// A new player.
await search.fill(NEW_NAME)
await page.getByText(`Add “${NEW_NAME}” as a new player`).click()
const dialog = page.getByRole('dialog')
check('add form: ladder position defaults to the bottom', (await dialog.getByLabel('Ladder position').inputValue()) === String(ladder.length + 1))
await dialog.getByRole('button', { name: 'Add and mark coming' }).click()
await page.getByText(/^Added /).first().waitFor()
s = await sessionNow()
const added = s.attendees.find((a) => a.name === NEW_NAME)
check('added and marked coming', !!added && s.attendees.length === 10)

// Unmark them again and remove them (no game data), so staging is as it was.
await search.fill(NEW_NAME)
await page.keyboard.press('Enter')
await page.waitForTimeout(1500)
check('…unmarked', (await sessionNow()).attendees.length === 9)
check('…removed', (await api('DELETE', `/api/players/${added?.id}`)).status === 200)

// Assign boxes: 9 → the modal's first option (1 box of 4, 1 of 5).
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Assign boxes' }).first().click()
await dialog.getByText('Choose how to split 9 players into boxes.').waitFor()
check('first option: 2 boxes', /2 boxes total/.test(await dialog.getByRole('radio').first().locator('xpath=..').innerText().catch(() => '')) || (await dialog.innerText()).includes('1 box of 4, 1 box of 5 — 2 boxes total'))
await dialog.getByRole('button', { name: 'Assign' }).click()
await page.waitForURL(/\/boxes$/)
s = await sessionNow()
check('Assign: playing, 2 boxes', s.status === 'games' && s.boxes.length === 2)
check('card: Playing, Matches: 0/8', /Playing/.test(await page.locator('.club-page-card').first().innerText()) && /Matches:\s*0\/8/.test(await page.locator('.club-page-card').first().innerText()))

// Re-open check-in from "…", then Assign offers the previous layout first.
await page.getByRole('button', { name: 'More session actions' }).first().click()
await page.getByRole('menuitem', { name: /Re-open check-in/ }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Delete boxes and re-open' }).click()
await page.waitForURL(/\/checkin$/)
check('re-opened: check-in', (await sessionNow()).status === 'attendance')
await page.getByRole('button', { name: 'Assign boxes' }).first().click()
check('previous layout offered first', /Previous layout/.test(await dialog.innerText()))
await page.keyboard.press('Escape')

// Delete from "…".
await page.getByRole('button', { name: 'More session actions' }).first().click()
await page.getByRole('menuitem', { name: /Delete session/ }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Delete session' }).click()
await page.waitForURL(/\/new\/sessions$/)
check('deleted', (await api('GET', `/api/sessions/${DATE}`)).status === 404)
const after = (await api('GET', '/api/leaderboard')).body.players
check('ladder back as it was', JSON.stringify(after) === JSON.stringify(ladder))
const errors = admin.errors()
check('no console errors', errors.length === 0, errors.join('\n'))
await admin.browser.close()
done('session')
