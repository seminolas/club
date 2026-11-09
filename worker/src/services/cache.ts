// A per-isolate cache for derived data that only changes when a session is
// closed, re-opened or deleted (db.closedSessionsVersion). Workers keep an
// isolate alive across many requests, so most page views read only the
// version, not the attendee rows behind it (UI-PORT.md, Data). The Cache API
// isn't an option: it does nothing on workers.dev.
//
// An isolate's memory is lost whenever it starts cold, which on the free plan
// is often, so savedByVersion also keeps the result in D1 (saved_totals,
// 0018): a cold isolate reads that one row rather than recomputing.
import * as db from '../db'
import type { DB } from '../db'

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

/**
 * cachedByVersion, backed by a row in saved_totals: on a miss in memory, the
 * saved result is used if it's for this version; otherwise the result is
 * computed and saved. Values must survive JSON (plain objects and arrays).
 * Saving can't fail the read: the next miss just computes it again.
 */
export function savedByVersion<T>(
  d: DB,
  clubId: number,
  name: string,
  version: string,
  compute: () => Promise<T>,
): Promise<T> {
  return cachedByVersion(`${name}:${clubId}`, version, async () => {
    const saved = await db.getSavedTotal(d, clubId, name)
    if (saved?.version === version) return JSON.parse(saved.data) as T
    const value = await compute()
    try {
      await db.saveTotal(d, clubId, name, version, JSON.stringify(value))
    } catch (err) {
      console.error(`saving ${name} failed`, err)
    }
    return value
  })
}

/** Tests: start from an empty cache. */
export function clearCache() {
  entries.clear()
}
