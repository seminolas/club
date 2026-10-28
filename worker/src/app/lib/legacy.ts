// The old UI's addresses (hash routes, incl. links shared on WhatsApp) and
// where they live now (UI-PORT.md, U9). The hash never reaches the server, so
// the browser redirects (routes/__root.tsx).

const OLD_TAB: Record<string, string> = {
  attendance: 'checkin',
  games: 'boxes',
  wrapup: 'results',
  // The oldest links (#/session/<date>/<tab>).
  results: 'boxes',
  leaderboard: 'results',
}

/** The new path for an old "#/…" hash, or null if it isn't one. */
export function legacyPath(hash: string): string | null {
  const h = hash.replace(/^#/, '')
  if (!h.startsWith('/')) return null
  let m = /^\/players\/(\d+)/.exec(h)
  if (m) return `/players/${m[1]}`
  if (h === '/players' || h === '/') return '/players'
  if (h === '/sessions') return '/sessions'
  m = /^\/(?:session\/)?(\d{4}-\d{2}-\d{2})(?:\/(\w+))?/.exec(h)
  if (m) {
    const step = m[2] ? OLD_TAB[m[2]] : undefined
    return step ? `/sessions/${m[1]}/${step}` : `/sessions/${m[1]}`
  }
  return null
}
