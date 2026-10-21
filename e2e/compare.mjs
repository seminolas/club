// Dev helper: open the same pages on two deployments and diff what's on screen.
// Usage: node compare.mjs '["/#/players", "/#/2026-10-20/games"]'
//   A defaults to prod, B to staging (set A= / B= to change). After a staging
//   refresh both hold the same data, so any difference is a behaviour change.
import { chromium } from '@playwright/test'

const paths = JSON.parse(process.argv[2])
const A = process.env.A ?? 'https://club.vilhelmas-f78.workers.dev'
const B = process.env.B ?? 'https://club-api-staging.vilhelmas-f78.workers.dev'

const browser = await chromium.launch()
const errors = []

async function textOf(base, path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => errors.push(`${base}${path} pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${base}${path} console: ${m.text()}`))
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const text = await page.locator('body').innerText()
  await page.close()
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

let differing = 0
for (const path of paths) {
  const [a, b] = await Promise.all([textOf(A, path), textOf(B, path)])
  const onlyA = a.filter((l, i) => l !== b[i])
  if (!onlyA.length && a.length === b.length) {
    console.log(`same  ${path} (${a.length} lines)`)
    continue
  }
  differing++
  console.log(`DIFF  ${path} (${a.length} vs ${b.length} lines)`)
  for (let i = 0, shown = 0; i < Math.max(a.length, b.length) && shown < 15; i++) {
    if (a[i] !== b[i]) {
      console.log(`  ${i + 1}: A ${JSON.stringify(a[i])}\n  ${' '.repeat(String(i + 1).length)}  B ${JSON.stringify(b[i])}`)
      shown++
    }
  }
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'))
console.log(differing ? `\n${differing} page(s) differ` : '\nAll pages match.')
await browser.close()
