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
