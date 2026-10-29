// The printed score sheets: a throwaway session (boxes of 4, 5, 6 and 7)
// printed as Cards and Grid. Writes PDFs and print-mode screenshots to
// <outDir> to look at (never commit them: real names) and checks there's one
// page per box. (Until the cutover, U7 compared these with the old UI's
// sheets: same layout and page counts.)
// Usage: node print-sheets.mjs <outDir>
import { mkdirSync, readFileSync } from 'node:fs'
import { BASE, check, done, open } from './new-ui-lib.mjs'
const out = process.argv[2]
if (!out) throw new Error('Usage: node print-sheets.mjs <outDir>')
mkdirSync(out, { recursive: true })
const DATE = '2099-01-13'
const PAIRINGS = {
  4: [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]],
  5: [[[0, 1], [2, 4]], [[2, 3], [1, 4]], [[0, 2], [3, 4]], [[0, 3], [1, 2]], [[0, 4], [1, 3]]],
  6: [[[0, 5], [2, 4]], [[1, 2], [0, 3]], [[1, 4], [3, 5]], [[1, 5], [0, 2]], [[2, 5], [3, 4]], [[0, 4], [1, 3]]],
  7: [[[0, 1], [2, 3]], [[0, 4], [1, 5]], [[0, 2], [4, 6]], [[0, 3], [5, 6]], [[1, 6], [2, 5]], [[1, 4], [3, 6]], [[2, 4], [3, 5]]],
}
const a = await open({ as: 'test-admin' })
const p = a.page
const api = (m, path, data) => p.request.fetch(BASE + path, { method: m, data, headers: { origin: BASE } })
await api('DELETE', `/api/sessions/${DATE}`)
await api('POST', '/api/sessions', { date: DATE })
const lb = await (await api('GET', '/api/leaderboard')).json()
const ids = lb.players.slice(0, 22).map((x) => x.id)
for (const id of ids) await api('PUT', `/api/sessions/${DATE}/attendance`, { player_id: id, attending: true })
let at = 0
const boxes = [4, 5, 6, 7].map((n) => {
  const players = ids.slice(at, (at += n))
  return { players, matches: PAIRINGS[n].map(([p1, p2]) => ({ pairs: [p1.map((i) => players[i]), p2.map((i) => players[i])], sets: [] })), finalPlacings: null }
})
console.log('boxes', (await api('PUT', `/api/sessions/${DATE}/boxes`, { boxes })).status())
const pdf = async (name) => {
  await p.pdf({ path: `${out}/${name}.pdf`, preferCSSPageSize: true, printBackground: true })
  // A4 landscape less the margins: 267 mm, about 1009 px wide.
  await p.setViewportSize({ width: 1009, height: 800 })
  await p.emulateMedia({ media: 'print' })
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  await p.emulateMedia({ media: null })
  await p.setViewportSize({ width: 1280, height: 900 })
}
await p.addInitScript(() => {
  window.print = () => {}
})
await a.go(`/sessions/${DATE}/boxes`)
await p.waitForTimeout(1000)
for (const layout of ['Cards', 'Grid']) {
  await p.getByRole('button', { name: 'Print score sheets' }).click()
  await p.getByRole('menuitem', { name: layout }).click()
  await p.waitForTimeout(500)
  await pdf(layout.toLowerCase())
}
await api('DELETE', `/api/sessions/${DATE}`)
const pages = (f) =>
  (readFileSync(`${out}/${f}.pdf`, 'latin1').match(/\/Type \/Page[^s]/g) ?? []).length
for (const layout of ['cards', 'grid'])
  check(`${layout}: one page per box`, pages(layout) === 4, String(pages(layout)))
const errors = a.errors()
check('no console errors', errors.length === 0, errors.join('\n'))
await a.browser.close()
done('print')
