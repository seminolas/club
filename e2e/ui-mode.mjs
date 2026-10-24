// Which UI the score checks drive: the current one (default), or the old
// Alpine one with UI=old (still on prod until the cutover is merged,
// UI-PORT.md U9; remove this switch once it is).
export const NEW = process.env.UI !== 'old'

/** A session's games / Boxes page. */
export const gamesPath = (date) =>
  NEW ? `/sessions/${date}/boxes` : `/#/${date}/games`

/** A score field. */
export const SCORE = NEW ? '[data-score]' : '.score-input'

/** Can each score field be typed in? (old: disabled; new: read-only) */
export const editable = NEW
  ? (els) => els.map((e) => !e.readOnly)
  : (els) => els.map((e) => !e.disabled)

/** Open every box's score entry (the new UI starts with boxes closed). */
export async function openBoxes(page) {
  if (!NEW) return page.waitForSelector(SCORE)
  await page.getByRole('button', { name: 'Expand all' }).click()
  await page.locator(`${SCORE}:visible`).first().waitFor()
  await page.waitForTimeout(400) // the panels finish sliding open
}

/** Before the page loads: remember every WebSocket it opens (new UI). */
export function trackSockets() {
  const Native = window.WebSocket
  window.__sockets = []
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args)
      window.__sockets.push(this)
    }
  }
}

/** Close the page's live connection, as a dead network would. */
export function dropSocket(page) {
  return NEW
    ? page.evaluate(() => window.__sockets.forEach((ws) => ws.close()))
    : page.evaluate(() =>
        document.querySelector('[x-data]')._x_dataStack[0]._live.ws.close(),
      )
}
