// A per-isolate cache for derived data that only changes when a session is
// closed, re-opened or deleted (db.closedSessionsVersion). Workers keep an
// isolate alive across many requests, so most page views read only the
// version, not the attendee rows behind it (UI-PORT.md, Data). The Cache API
// isn't an option: it does nothing on workers.dev.
const entries = new Map<string, { version: string; value: Promise<unknown> }>()

export function cachedByVersion<T>(
  name: string,
  version: string,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = entries.get(name)
  if (hit && hit.version === version) return hit.value as Promise<T>
  const value = compute()
  entries.set(name, { version, value })
  // A failed computation isn't kept.
  value.catch(() => {
    if (entries.get(name)?.value === value) entries.delete(name)
  })
  return value
}

/** Tests: start from an empty cache. */
export function clearCache() {
  entries.clear()
}
