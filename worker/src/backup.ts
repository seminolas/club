// Nightly backups: what to leave out of a `wrangler d1 export` dump before it
// goes to the backups repo. Sign-in sessions and verification rows are dropped
// (a restore just means signing in again), and Google tokens and password
// hashes on accounts are blanked, so a leaked backup can't be used to sign in
// as anyone. Everything else is kept as exported.

const DROP_TABLES = new Set(['session', 'verification'])
const BLANK_COLUMNS: Record<string, Set<string>> = {
  account: new Set([
    'access_token',
    'refresh_token',
    'id_token',
    'access_token_expires_at',
    'refresh_token_expires_at',
    'password',
  ]),
}

// wrangler writes one INSERT per line: INSERT INTO "t" ("a","b") VALUES(...);
const INSERT = /^INSERT INTO "([^"]+)" \(([^)]*)\) VALUES\((.*)\);$/

/** Split a VALUES list into its SQL literals ('text' with '' escapes, NULL, numbers, X'..'). */
export function splitValues(values: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < values.length) {
    let start = i
    if (values[i] === "'" || (values[i] === 'X' && values[i + 1] === "'")) {
      i = values[i] === 'X' ? i + 2 : i + 1
      for (;;) {
        if (i >= values.length) throw new Error('Unterminated string in dump')
        if (values[i] === "'") {
          if (values[i + 1] === "'") i += 2
          else {
            i++
            break
          }
        } else i++
      }
    } else {
      while (i < values.length && values[i] !== ',') i++
    }
    out.push(values.slice(start, i).trim())
    if (values[i] === ',') i++
    start = i
  }
  return out
}

/** The dump without sign-in sessions, verification rows or account secrets. */
export function sanitizeDump(dump: string): string {
  return dump
    .split('\n')
    .flatMap((line) => {
      const m = INSERT.exec(line)
      if (!m) return [line]
      const [, table, columnList, values] = m
      if (DROP_TABLES.has(table)) return []
      const blank = BLANK_COLUMNS[table]
      if (!blank) return [line]
      const columns = columnList
        .split(',')
        .map((c) => c.trim().replace(/^"|"$/g, ''))
      const literals = splitValues(values)
      if (literals.length !== columns.length)
        throw new Error(`Couldn't parse an INSERT into ${table}`)
      const kept = literals.map((v, i) => (blank.has(columns[i]) ? 'NULL' : v))
      return [
        `INSERT INTO "${table}" (${columnList}) VALUES(${kept.join(',')});`,
      ]
    })
    .join('\n')
}
