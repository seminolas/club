// Sharing a session: links to its box games and its results, and to the
// club's ladder, which is always the current one.

type Club = { slug: string; label: string }

/** The shared message: the night, then each link under its label. */
function shareText(club: Club, date: string) {
  const base = `${location.origin}/${club.slug}`
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Pacific/Auckland',
  })
  // Each link on its own line: long links after a label wrap badly on phones.
  return [
    `🏸 ${club.label} box night · ${day}`,
    '',
    'Box games and scores:',
    `${base}/sessions/${date}/boxes`,
    '',
    'Tonight’s results:',
    `${base}/sessions/${date}/results`,
    '',
    'Ladder (always up to date):',
    `${base}/players`,
  ].join('\n')
}

export function shareOnWhatsApp(club: Club, date: string) {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(shareText(club, date))}`,
    '_blank',
  )
}

/** Whether this browser has a share sheet (phones, some desktops). */
export const canShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/**
 * The same message through the device's share sheet: works from in-app
 * browsers and home-screen apps, where a wa.me link may not open WhatsApp.
 */
export async function shareSession(club: Club, date: string) {
  try {
    await navigator.share({ text: shareText(club, date) })
  } catch (err) {
    // Closing the sheet without sharing isn't an error.
    if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
  }
}
