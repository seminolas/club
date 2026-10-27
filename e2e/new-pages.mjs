// Every page of the new UI (UI-PORT.md) on staging, signed out, as Test Player
// and as Test Admin, on a phone and a desktop, light and dark: no console
// errors (that includes server/browser render mismatches), no sideways page
// scroll on phones. Screenshots go to <outDir> if given (never commit them:
// real names).
// Usage: node new-pages.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { BASE, check, done, open } from './new-ui-lib.mjs'

const out = process.argv[2]
if (out) mkdirSync(out, { recursive: true })
// The latest closed session, for its three steps.
const sessions = await (await fetch(`${BASE}/api/sessions`)).json()
const closed = sessions.find((s) => s.status === 'closed')?.date
const ladder = (await (await fetch(`${BASE}/api/leaderboard`)).json()).players
const pages = [
  '/players',
  '/sessions',
  `/sessions/${closed}/checkin`,
  `/sessions/${closed}/boxes`,
  `/sessions/${closed}/results`,
]

for (const as of [undefined, 'test-player', 'test-admin']) {
  for (const phone of [true, false]) {
    for (const scheme of ['light', 'dark']) {
      const s = await open({ as, phone })
      await s.page.emulateMedia({ colorScheme: scheme })
      const list = as === 'test-admin' ? [...pages, `/players/${ladder[0].id}`] : pages
      for (const path of list) {
        await s.go(path)
        await s.page.waitForTimeout(400)
        const tag = `${as ?? 'out'} ${phone ? 'phone' : 'desk'} ${scheme} ${path}`
        if (out)
          await s.page.screenshot({
            path: `${out}/${tag.replace(/[ /]+/g, '_')}.png`,
          })
        const errors = s.errors()
        // The Test Player has no player yet on a fresh staging: "Which player
        // are you?" covers the page, which is right.
        check(`${tag}: no console errors`, errors.length === 0, errors.join('\n'))
        if (phone) {
          const wide = await s.page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          )
          check(`${tag}: no sideways scroll`, !wide)
        }
      }
      await s.browser.close()
    }
  }
}
// Old links (the Alpine UI's #/ routes, e.g. shared on WhatsApp, and /new/
// while the new UI was built) land on today's pages.
{
  const s = await open()
  for (const [from, to] of [
    ['/#/players', '/players'],
    ['/#/sessions', '/sessions'],
    [`/#/${closed}/games`, `/sessions/${closed}/boxes`],
    [`/#/${closed}/wrapup`, `/sessions/${closed}/results`],
    [`/#/session/${closed}/leaderboard`, `/sessions/${closed}/results`],
    ['/new/sessions', '/sessions'],
    [`/new/sessions/${closed}/checkin`, `/sessions/${closed}/checkin`],
  ]) {
    await s.go(from)
    await s.page.waitForURL((u) => u.pathname === to, { timeout: 10000 }).catch(() => {})
    check(`${from} → ${to}`, new URL(s.page.url()).pathname === to, s.page.url())
  }
  await s.browser.close()
}
// The Ladder's Skill column (hidden by default) and "How rankings work".
{
  const s = await open()
  await s.go('/players')
  check('Skill column hidden by default', !(await s.page.getByRole('columnheader', { name: /Skill/ }).count()))
  await s.page.getByRole('button', { name: 'Columns' }).click()
  await s.page.getByText('Skill', { exact: true }).click()
  await s.page.keyboard.press('Escape')
  const cells = await s.page.locator('tbody tr td:nth-child(2)').allInnerTexts()
  check('Skill column shows ranks', cells.length > 0 && cells.some((c) => /^#\d+$/.test(c.trim())), cells.slice(0, 5).join(', '))
  await s.page.getByRole('button', { name: 'How rankings work' }).click()
  await s.page.getByRole('dialog').getByText('Ladder position (#)').waitFor({ timeout: 5000 }).catch(() => {})
  check('"How rankings work" explains both', (await s.page.getByRole('dialog').getByText('Ladder position (#)').isVisible()) && (await s.page.getByRole('dialog').getByRole('heading', { name: 'Skill' }).isVisible()))
  const errors = s.errors()
  check('no console errors (Skill)', errors.length === 0, errors.join('\n'))
  await s.browser.close()
}
done('page')
