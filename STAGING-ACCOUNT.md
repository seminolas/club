# Moving staging to its own Cloudflare account

**Status:** planned (2026-10-29), not started.

## Why

On 2026-10-29 the Cloudflare account ran out of **D1's free-tier daily row reads** (5 million a day, error code 7500). The limit covers the whole account, and staging and prod are on the same account, so prod stopped reading its database too, until midnight UTC (13:00 NZDT).

The cause was a day of repeated full browser-check runs on staging. One `new-pages.mjs` run is 12 passes (3 users × phone/desktop × light/dark), roughly 300,000 rows. Staging traffic counts against the same allowance as the live app.

**Goal:** staging gets its own free account, and so its own allowances: 5 million D1 rows read and 100,000 Worker requests a day. Testing can then never take prod down. Prod, its database and the merge-to-deploy flow (Workers Builds) don't change.

## Steps

### The developer (needs their logins)

1. **Create a free Cloudflare account** for staging, e.g. with a club email, and pick its `workers.dev` subdomain. The staging Worker's name must still contain `staging`: `testLoginEnabled` (`worker/src/better-auth.ts`) only allows test sign-in on such hostnames. The URL becomes e.g. `https://club-staging.<new-subdomain>.workers.dev`.
2. **Create an API token** in the new account (Workers Scripts edit, D1 edit, Account settings read). Add GitHub secrets to `seminolas/club`: `CF_STAGING_API_TOKEN`, `CF_STAGING_ACCOUNT_ID`.
3. **Google sign-in:** in the Google Cloud console, add `https://<new host>/api/auth/callback/google` to the OAuth client's redirect URIs, and the new host to its JavaScript origins. Keep the old ones until the switch is done.
4. **Worker secrets**, after the first deploy (step 6), logged in to the new account: `Get-Clipboard | npx wrangler secret put NAME --env staging` for
   - `BETTER_AUTH_SECRET` (new random value)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (the same Google client as now)
   - `HC_API_KEY` (a nonsense value, as now)

### Claude (one PR)

5. **Config and workflows:**
   - `worker/wrangler.toml`, `[env.staging]`: the new D1 `database_id` and `BETTER_AUTH_URL`, and the Worker name if it changes.
   - `.github/workflows/deploy-staging.yml`: the staging token and account.
   - `.github/workflows/staging-refresh.yml`: exports from prod with `CF_API_TOKEN`/`CF_ACCOUNT_ID`, and wipes, loads and adds the test users with the staging token. It's the only workflow that needs both.
   - The new host in the e2e default URL (`e2e/new-ui-lib.mjs` and the other scripts' `BASE`), `e2e/compare*.mjs`, `worker/src/better-auth.test.ts`, AGENTS.md and README.
   - `npm run types` to regenerate `worker-configuration.d.ts`.
6. **Create the database** in the new account (`wrangler d1 create club-staging`) and deploy the branch once. The `SessionRoom` Durable Object sets itself up on that first deploy (SQLite-backed Durable Objects work on the free plan).
7. **Run the staging refresh** (source: prod) to copy in prod's data and the test accounts. Then run each browser check **once**.

### Afterwards

8. Once the new staging is confirmed working, **delete the old staging Worker (`club-api-staging`) and D1 database (`club-staging`)** from the prod account. Deleting is permanent: confirm with the developer first.
9. Optionally narrow the prod token (`CF_API_TOKEN`) to what prod still needs: D1 export for backups and the refresh.

## Meanwhile: keeping test runs light

- Run the heavy browser checks (`new-pages`, `new-session`, `print-sheets` and the rest) **once per finished change**, not repeatedly while debugging. Prefer a single-page script for that.
- Keep staging testing light on session days (Monday evening and Tuesday NZ time).
- If staging or prod returns 500s with "Failed query", check for code 7500 (`wrangler d1 execute club-staging --env staging --remote --command "select count(*) from sessions"`) before debugging the code.
- An option to remove most Cloudflare reads from testing: run the browser checks against the local dev server, with the latest sanitised backup loaded into its local D1 and test sign-in on localhost. Delete the local data afterwards, as with any real-data copy.
