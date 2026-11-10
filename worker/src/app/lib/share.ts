/**
 * Share a session on WhatsApp: links to its box games and its results, and
 * to the club's ladder, which is always the current one.
 */
export function shareOnWhatsApp(
  club: { slug: string; label: string },
  date: string,
) {
  const base = `${location.origin}/${club.slug}`
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Pacific/Auckland',
  })
  // Each link on its own line: long links after a label wrap badly on phones.
  const lines = [
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
  ]
  window.open(
    `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
    '_blank',
  )
}
