/** Share a closed session on WhatsApp, with the old UI's text and links. */
export function shareOnWhatsApp(date: string) {
  const base = location.origin
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Pacific/Auckland',
  })
  // The same text as the old UI's, with today's addresses (old links still
  // work: lib/legacy.ts).
  const lines = [
    `🏸 ${label} — Box Night`,
    '',
    `Results: ${base}/sessions/${date}/boxes`,
    `Ladder:  ${base}/sessions/${date}/results`,
  ]
  window.open(
    `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
    '_blank',
  )
}
