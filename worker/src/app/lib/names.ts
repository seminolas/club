// Display names. A player's short name is their preferred name, else their
// first name (the old UI's firstName in js/app.js); in any one view, people
// whose short names clash are shown by full name (club-next's rule, via
// club-table-lab).

/** Strips the asterisks used as ladder markers around a name. */
export function cleanName(name: string): string {
  return name.replace(/^\*+\s*|\s*\*+$/g, '')
}

export function shortName(name: string, preferredName?: string | null) {
  if (preferredName) return preferredName
  const clean = cleanName(name)
  return clean.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]+/)?.[0] ?? clean.trim()
}

export interface NamedPerson {
  id: string
  displayName: string
  fullName: string
}

/** Map of person id → the label to show in a view containing exactly `people`. */
export function viewLabels(
  people: readonly NamedPerson[],
): Map<string, string> {
  const counts = new Map<string, number>()
  for (const p of people) {
    const key = p.displayName.trim().toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const p of people) {
    const clash = (counts.get(p.displayName.trim().toLowerCase()) ?? 0) > 1
    out.set(p.id, clash ? cleanName(p.fullName) : p.displayName)
  }
  return out
}

/**
 * A player's name in a box, as on the score sheets: the short name, or
 * "First L." if that short name clashes with someone else's among `everyone`
 * (old UI: _dedupedDisplayName). Custom box layouts are typed in these.
 */
export function boxName(
  player: { name: string; preferredName?: string | null },
  everyone: readonly { name: string; preferredName?: string | null }[],
): string {
  const first = shortName(player.name, player.preferredName)
  const clash = everyone.some(
    (o) =>
      o.name !== player.name && shortName(o.name, o.preferredName) === first,
  )
  if (!clash) return first
  const words = cleanName(player.name)
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(w))
  if (words.length < 2) return first
  const initial = words[words.length - 1].match(/[a-zA-ZÀ-ÖØ-öø-ÿ]/)?.[0]
  return initial ? `${first} ${initial.toUpperCase()}.` : first
}
