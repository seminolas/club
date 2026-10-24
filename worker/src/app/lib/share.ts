/** Share a closed session on WhatsApp, with the old UI's text and links. */
export function shareOnWhatsApp(date: string) {
  const base = location.origin
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Pacific/Auckland',
  })
  // The old UI's links (they keep working after the cutover, UI-PORT.md U9).
  const lines = [
    `🏸 ${label} — Box Night`,
    '',
    `Results: ${base}/#/${date}/games`,
    `Ladder:  ${base}/#/${date}/wrapup`,
  ]
  window.open(
    `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
    '_blank',
  )
}
