// Display names. Tables show full names; boxes, score sheets and game lines
// show the short name: the preferred name, else the first name (the old UI's
// firstName in js/app.js).

/** Strips the asterisks used as ladder markers around a name. */
export function cleanName(name: string): string {
  return name.replace(/^\*+\s*|\s*\*+$/g, '')
}

export function shortName(name: string, preferredName?: string | null) {
  if (preferredName) return preferredName
  const clean = cleanName(name)
  return clean.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]+/)?.[0] ?? clean.trim()
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
