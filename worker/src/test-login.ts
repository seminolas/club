// Passwords for the staging-only test accounts (S4a). PBKDF2-SHA256 through
// WebCrypto: native, so cheap on the Workers free plan's CPU budget, unlike
// BetterAuth's default scrypt. Only synthetic accounts with long random
// passwords use this, so a modest iteration count is enough.

const ITERATIONS = 10_000
const enc = new TextEncoder()
const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) =>
  new Uint8Array(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
}

/** `pbkdf2:<iterations>:<salt hex>:<hash hex>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2:${ITERATIONS}:${hex(salt)}:${hex(await derive(password, salt, ITERATIONS))}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split(':')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false
  const actual = hex(await derive(password, unhex(salt), Number(iterations)))
  // Constant-time compare.
  let diff = actual.length ^ hash.length
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i % hash.length)
  return diff === 0
}

/** The synthetic accounts on staging (re-created after every refresh). */
export const TEST_USERS = [
  { id: 'test-admin', name: 'Test Admin', role: 'admin' },
  { id: 'test-player', name: 'Test Player', role: 'user' },
] as const

/**
 * Club 1's player for the test admin: everyone signed in needs a player, admins
 * too (V1). No ladder position, so it doesn't show on the ladder. The test
 * player stays unlinked, to exercise "Which player are you?".
 */
export const TEST_ADMIN_PLAYER_NAME = 'Test Admin'

export const testUserEmail = (id: string) => `${id}@staging.invalid`

/** SQL that (re)creates the test accounts with the given password. */
export async function testUsersSql(password: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const lines: string[] = [
    // Players can't point at a deleted user: unlink, and drop the test admin's
    // own player (recreated below).
    `UPDATE players SET user_id = NULL WHERE user_id IN (${TEST_USERS.map((u) => `'${u.id}'`).join(', ')}) AND name <> '${TEST_ADMIN_PLAYER_NAME}';`,
    `DELETE FROM players WHERE user_id = 'test-admin' AND name = '${TEST_ADMIN_PLAYER_NAME}';`,
  ]
  for (const u of TEST_USERS) {
    // Deleting the user also removes its accounts and sessions (cascade).
    lines.push(`DELETE FROM user WHERE id = '${u.id}';`)
    lines.push(
      `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('${u.id}', '${u.name}', '${testUserEmail(u.id)}', 1, '${u.role}', ${now}, ${now});`,
    )
    lines.push(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('${u.id}-credential', '${u.id}', 'credential', '${u.id}', '${await hashPassword(password)}', ${now}, ${now});`,
    )
  }
  lines.push(
    `INSERT INTO players (club_id, name, user_id) VALUES (1, '${TEST_ADMIN_PLAYER_NAME}', 'test-admin');`,
  )
  return lines.join('\n') + '\n'
}
