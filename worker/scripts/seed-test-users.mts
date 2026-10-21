// Prints SQL that (re)creates the staging test accounts (Test Admin, Test
// Player) with the password in TEST_LOGIN_PASSWORD. Run by the staging
// refresh workflow after loading prod's data.
// Usage: TEST_LOGIN_PASSWORD=... npx tsx scripts/seed-test-users.mts > seed.sql
import { testUsersSql } from '../src/test-login'

const password = process.env.TEST_LOGIN_PASSWORD
if (!password || password.length < 20) {
  console.error('TEST_LOGIN_PASSWORD must be set (20+ characters)')
  process.exit(1)
}
process.stdout.write(await testUsersSql(password))
