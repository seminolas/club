// Used by the nightly backup workflow: reads a `wrangler d1 export` dump,
// writes it without sign-in sessions, verification rows or account secrets
// (see src/backup.ts).
// Usage: npx tsx scripts/sanitize-backup.mts <in.sql> <out.sql>
import { readFileSync, writeFileSync } from 'node:fs'
import { sanitizeDump } from '../src/backup'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: sanitize-backup.mts <in.sql> <out.sql>')
  process.exit(1)
}
const dump = readFileSync(input, 'utf8')
const clean = sanitizeDump(dump)
writeFileSync(output, clean)
const count = (s: string, table: string) =>
  s.split('\n').filter((l) => l.startsWith(`INSERT INTO "${table}" `)).length
console.log(
  `rows: ${count(clean, 'players')} players, ${count(clean, 'sessions')} sessions, ${count(clean, 'user')} users, ${count(clean, 'account')} accounts; dropped ${count(dump, 'session')} sign-in sessions, ${count(dump, 'verification')} verifications`,
)
