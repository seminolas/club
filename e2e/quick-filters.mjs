// Quick filters (ListTable `quickFilters`) on staging: "+ Coming" on check-in,
// "+ My box" on Boxes and Results, "+ I played" on Sessions. Applying one
// turns it into an ordinary pill and hides the shortcut; removing the pill
// brings it back. Links Test Player to someone who played the latest closed
// night for the "me" ones, and unlinks again afterwards.
// Usage: node quick-filters.mjs [outDir]   (screenshots if outDir is given)
import { mkdirSync } from 'node:fs'
import { BASE, check, done, open } from './new-ui-lib.mjs'
import { NEW } from './ui-mode.mjs'

const out = process.argv[2]
if (out) mkdirSync(out, { recursive: true })
const P = NEW && !process.env.ROOT ? '/new' : ''
const sessions = await (await fetch(`${BASE}/api/sessions`)).json()
const night = sessions.find((s) => s.status === 'closed').date
const detail = await (await fetch(`${BASE}/api/sessions/${night}`)).json()

const admin = await open({ as: 'test-admin' })
const api = (page, method, path, data) =>
  page.request.fetch(BASE + path, { method, data, headers: { origin: BASE } })
// Test Player starts unlinked, then claims someone from that night.
const player = await open({ as: 'test-player' })
const linked = (await (await api(player.page, 'GET', '/api/me')).json()).player
if (linked) await api(admin.page, 'POST', `/api/players/${linked.id}/unlink`, {})
const claimable = (await (await api(player.page, 'GET', '/api/me/claimable')).json()).players
const played = new Set(detail.attendees.map((p) => p.id))
const me = claimable.find((p) => played.has(p.id))
check('a claimable player played that night', !!me)
await api(player.page, 'POST', '/api/me/claim', { player_id: me.id })

async function tryQuick(s, path, label, shot) {
  await s.go(P + path)
  const quick = s.page.getByRole('button', { name: `Add filter: ${label}` })
  check(`${path}: "+ ${label}" shown`, await quick.isVisible())
  if (out) await s.page.screenshot({ path: `${out}/${shot}-before.png` })
  const rows = () => s.page.locator('tbody tr:visible').count()
  const pills = () =>
    s.page.getByRole('button', { name: /^Remove filter: / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const before = await rows()
  const pillsBefore = await pills()
  await quick.click()
  await s.page.waitForTimeout(300)
  const added = (await pills()).filter((x) => !pillsBefore.includes(x))
  check(`${path}: it shows as a pill (${added.join(', ')})`, added.length === 1)
  const pill = s.page.getByRole('button', { name: added[0] })
  const after = await rows()
  check(`${path}: applying it filters (${before} → ${after} rows) and hides the shortcut`, after < before && !(await quick.isVisible()))
  if (out) await s.page.screenshot({ path: `${out}/${shot}-after.png` })
  await pill.click()
  await s.page.waitForTimeout(300)
  check(`${path}: removing the pill brings it back`, await quick.isVisible())
}

for (const phone of [false, true]) {
  const s = await open({ as: 'test-player', phone })
  const tag = phone ? 'phone' : 'desk'
  await tryQuick(s, `/sessions/${night}/checkin`, 'Coming', `${tag}-checkin`)
  await tryQuick(s, `/sessions/${night}/boxes`, 'My box', `${tag}-boxes`)
  await tryQuick(s, `/sessions/${night}/results`, 'My box', `${tag}-results`)
  await tryQuick(s, '/sessions', 'I played', `${tag}-sessions`)
  await s.go(P + '/players')
  check('ladder: no quick filters', !(await s.page.getByRole('button', { name: /^Add filter:/ }).count()))
  const errors = s.errors()
  check(`no console errors (${tag})`, errors.length === 0, errors.join('\n'))
  await s.browser.close()
}

// Signed out: no "me" shortcuts.
{
  const s = await open()
  await s.go(P + `/sessions/${night}/boxes`)
  check('signed out: no "My box"', !(await s.page.getByRole('button', { name: 'Add filter: My box' }).count()))
  await s.browser.close()
}

await api(admin.page, 'POST', `/api/players/${me.id}/unlink`, {})
check('Test Player unlinked again', !(await (await api(player.page, 'GET', '/api/me')).json()).player)
await admin.browser.close()
await player.browser.close()
done('quick filter')
