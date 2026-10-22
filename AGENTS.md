# AGENTS.md — Northland Badminton Club

Comprehensive context for AI agents working on this codebase.

---

## Deployment topology

```
GitHub repo: seminolas/club  (branch: master)
│
├── Static assets (index.html, js/) ← served by Cloudflare Workers assets
└── worker/                                ← Cloudflare Worker (Hono API)
    ├── src/index.ts                       ← all API routes
    ├── src/better-auth.ts                 ← BetterAuth (sign-in) setup
    ├── src/auth.ts                        ← requireAdmin middleware, getSession
    ├── src/db.ts                          ← all D1 queries (Drizzle)
    ├── src/db/schema.ts                   ← Drizzle schema (typed mirror of the migrations)
    ├── src/types.ts                       ← shared TypeScript types
    └── migrations/                        ← D1 schema migrations (tracked by wrangler)
```

**Production URL:** https://club.vilhelmas-f78.workers.dev/  
**Staging URL:** https://club-api-staging.vilhelmas-f78.workers.dev/  
The Worker serves both the static frontend and the `/api/*` routes from a single deployment.

**Environments:**
- `prod` → D1 database `club-prod` (id: `dc014559-276f-4c9b-8aef-4071b4da9a3c`)
- `staging` → D1 database `club-staging` (id: `ffcff689-6918-40f3-bde8-78502d18d0b5`), worker name `club-api-staging`

**CRITICAL:** The HC API key in staging is intentionally nonsense. Never attempt HelloClub sync from staging.

---

## Deploying

```bash
cd worker
npx wrangler deploy                    # prod
npx wrangler deploy --env staging      # staging
```

The Worker compiles `src/index.ts` via wrangler on deploy. The only frontend build is the rules bundle: `wrangler.toml`'s `[build]` runs `npm run build:web` (esbuild) before every deploy, writing `js/dist/rules.js` (gitignored). Everything else under `js/` is served as written.

**If wrangler prompts to create `wrangler.jsonc`:** decline. The existing `wrangler.toml` is correct. The proposed config uses `directory: "."` (worker subdirectory) instead of `directory: ".."` (repo root), which would break static asset serving.

**Commit before deploying** — wrangler deploys from the filesystem, not from git. It's easy to deploy uncommitted changes. Check `git status` first.

**Staging from GitHub:** the "Deploy branch to staging" workflow (`.github/workflows/deploy-staging.yml`, run from the Actions tab or `gh workflow run deploy-staging.yml --ref <branch>`) typechecks, lints, tests and deploys a committed branch to staging.

**Assets:** the Worker serves the repo root as static files, minus what `.assetsignore` lists (docs, `temp/`, `e2e/`, `worker/`, tooling). Anything new at the root that isn't part of the site must be added there, or it becomes public.

**Every push to `master` deploys to prod automatically** (Cloudflare Workers Builds is connected to the repo; it shows up as a "Workers Builds: club" check). Builds for other branches are switched off: before 2026-10-21 they were on and deployed branches straight to prod. So merging a PR is the prod deploy, and a manual `npx wrangler deploy` is only needed to redeploy without a commit. The build runs `sh deploy.sh` (`npm ci` + `wrangler deploy` in `worker/`).

**Usual flow:** branch → CI green → deploy to staging → browser checks (`e2e/`) → merge (deploys to prod) → check prod.

---

## Staging refresh (GitHub Action)

`.github/workflows/staging-refresh.yml` — triggered manually via the GitHub Actions UI:

1. Exports prod D1 to a SQL dump
2. Wipes staging — drops all tables in FK-safe order with `PRAGMA foreign_keys = OFF`
3. Loads the prod dump into staging

Staging receives prod's already-migrated schema via the dump, so **apply new migrations to prod before pushing to master** — the refresh picks them up automatically from the dump. After loading, the refresh re-creates the staging test accounts (see Authentication). It also drops the BetterAuth tables in its wipe step.

**If you add a new table to the schema**, update the wipe step in `staging-refresh.yml`. Add the table to the `DROP TABLE IF EXISTS` list in child-before-parent order (leaf/child tables before the parent tables they reference). Missing entries cause the wipe to fail with `FOREIGN KEY constraint failed` on whichever parent table is dropped before its child. The current order:

```
match_players → match_sets → matches → box_players → boxes → attendees
→ session_ranks → sessions → players → session → account → verification
→ user → clubs → d1_migrations
```
(The list also still drops long-gone tables, e.g. `session_lb`, `roles`; harmless with `IF EXISTS`.)

---

## Repo structure

```
/
├── index.html          # main SPA shell
├── js/
│   ├── app.js          # Alpine.js app component (all UI logic)
│   ├── storage.js      # HTTP client — wraps all /api/* calls
│   ├── dist/rules.js   # built rules bundle (from worker/src/browser; not committed)
│   └── csv.js          # CSV import/export helpers
├── temp/               # scratch/experimental files (not served by Worker)
│   ├── stats.html      # analytics dashboard experiment (Observable Plot + Grid.js)
│   └── stats2.html     # analytics dashboard v2 experiment
├── e2e/                # Playwright browser checks (own package.json; not served)
│   └── shot.mjs        # open pages, screenshot, report console errors
├── .github/workflows/  # ci.yml (typecheck, lint, format, tests), deploy-staging.yml, staging-refresh.yml
└── worker/
    ├── wrangler.toml
    ├── src/
    │   ├── index.ts    # Hono app, all route handlers
    │   ├── auth.ts     # verifyGoogleToken, signJwt, requireAdmin middleware
    │   ├── db.ts       # all D1 queries
    │   ├── db/schema.ts # Drizzle schema, mirrors what the migrations create
    │   ├── types.ts    # Env, JwtPayload, BoxInput, SessionStatus, etc.
    │   ├── domain/     # the box-night rules (pure TypeScript), shared by Worker and browser
    │   ├── browser/    # the old algorithm.js API on top of domain/, bundled to js/dist/rules.js
    │   ├── test/       # test helpers: local D1 (d1.ts), fixture club (fixtures/seed.ts), prod schema snapshot, frozen pre-S1 algorithm.js
    │   └── *.test.ts   # Vitest tests
    ├── migrations/     # SQL migration files, applied with `wrangler d1 migrations apply`
    └── scripts/        # one-off data repair scripts (not production code)
```

## Checks

```bash
cd worker
npm run typecheck   # worker code (workers types) + tests (also node types, via tsconfig.test.json)
npm test            # vitest
npm run lint        # ESLint (club-next's config)
npm run format      # Prettier + eslint --fix (CI runs format:check)
npm run build:web   # bundle the rules for the browser (deploys do this automatically)
npx tsx scripts/replay-ladder.mts   # replay every closed session through old and new rules

cd e2e              # first time: npm install && npx playwright install chromium
node shot.mjs <outDir> '[{"go":"/#/players","shot":"ladder"},{"mobile":true},{"go":"/#/2026-10-20/games","shot":"session"}]'
node compare.mjs '["/#/players","/#/2026-10-20/games"]'   # same pages on prod vs staging, diff the on-screen text
node compare-api.mjs   # every public API response on prod vs staging must be identical JSON
node admin-flow.mjs    # a whole admin session night on staging as Test Admin, checked, then cleaned up
node auth-ui.mjs       # sign-in in the browser on staging: to Google, Test Admin UI + sign out, "This is me" + admin unlink
```

CI runs typecheck, lint, format check and tests on every push to `master` and every PR. Lint and formatting cover `worker/` only; `js/` and `index.html` are left as they are until they're replaced (MIGRATION.md, S5). `shot.mjs` defaults to staging (`BASE=` to change) and runs signed out, since sign-in is Google-only. It prints `ERRORS:` if any page logged a console error or a step failed. `compare.mjs` and `compare-api.mjs` are the regression checks for a change on staging: right after a staging refresh both sites hold the same data, so any difference is a behaviour change. Rules tests: `rules.characterization.test.ts` pins down how the rules behave as the app relies on them; `rules.differential.test.ts` compares the new rules with the frozen pre-S1 `algorithm.js` on random inputs; `domain/domain.test.ts` tests the shared rules directly. Database tests run on a real local D1 (wrangler's `getPlatformProxy`, the same engine as prod) built from `worker/migrations` and loaded with a small fixture club (made-up names; the repo is public): `db.characterization.test.ts` pins every query's results and writes, `api.characterization.test.ts` the routes' JSON including a whole admin session night.

**Legacy:** `C:/dev/src/temp-badminton/` is the old GitHub Pages version backed by GitHub API for storage. It is no longer active. All production work happens in this repo.

---

## Database schema

D1 (SQLite). All queries are in `worker/src/db.ts`. They use **Drizzle** (`drizzle-orm/d1`) over the request's D1 session (S2). Multi-row writes go in one D1 batch, one statement per row: D1 allows at most 100 bound parameters per statement, so don't bundle ladder or box rows into a single insert (a real-scale test catches it). `worker/src/db/schema.ts` is the Drizzle schema: a typed mirror of the tables, not the source of truth. The migrations are, and `schema.test.ts` fails if the two drift (or if the migrations stop reproducing prod's schema, captured in `src/test/fixtures/prod-schema.json`). Changing the schema means a new migration **and** a matching `schema.ts` change.

```sql
clubs           -- id, name, short_name, config (JSON)
players         -- id, club_id, name, hc_member_id, archived_at, email, preferred_name, user_id (→ user)
sessions        -- id, club_id, date (YYYY-MM-DD), status, created_at, closed_at
session_ranks   -- session_id, player_id, rank_position, phase ('before'|'after')  (replaces old session_lb)
attendees       -- session_id, player_id
boxes           -- id, session_id, box_number
box_players     -- box_id, player_id, position (0-indexed)
matches         -- id, box_id, match_number
match_sets      -- match_id, set_number, score_a, score_b
match_players   -- match_id, player_id, side (0 = pair A, 1 = pair B)
user            -- BetterAuth: id (text), name, email, role ('admin'|'user'), ...
session, account, verification  -- BetterAuth (account: provider_id 'google'|'credential', account_id = Google sub)
```

`club_id = 1` is hard-coded throughout (`CLUB_ID = 1` in `index.ts`). Multi-club support is noted as future work.

**Migrations are tracked by wrangler** (the `d1_migrations` table). Add `worker/migrations/NNNN_name.sql`, then:
```bash
cd worker
npx wrangler d1 migrations list club-staging --env staging --remote   # what's pending
npm run db:migrate:staging                                         # rehearse on staging (refresh it from prod first)
npx wrangler d1 export club-prod --remote --output <backup.sql>      # back up prod
npm run db:migrate:prod
```
Don't use `wrangler d1 execute --file` for migrations any more: wrangler wouldn't record them and would try to run them again. Files 0002–0010 were applied that way and backfilled into `d1_migrations` on 2026-10-21 (`worker/scripts/backfill-d1-migrations.sql`). There is a naming collision at `0002` (two files); both were applied. The next migration is `0011`.

---

## Session state machine

```
attendance → games → closed
              ↑         ↓
         reopen-attendance  reopen (→ games)
```

- `attendance` — players being marked present; boxes not yet assigned
- `games` — boxes assigned, scores being entered
- `closed` — session complete, leaderboard updated

State is stored in `sessions.status`. The frontend reflects this with different tab visibility.

---

## API routes

All under `/api/*`. Routes marked admin need a BetterAuth session whose user is `admin` (`requireAdmin`); the browser sends the session cookie automatically. BetterAuth's own endpoints are under `/api/auth/*`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST/GET | `/api/auth/*` | — | BetterAuth: `sign-in/social` (Google), `callback/google`, `sign-out`, `get-session`; on staging also `sign-in/email` (test accounts) |
| GET | `/api/me` | — | Who's signed in: `{ signedIn, isAdmin, name?, player?, justLinked? }`; auto-links by email (see Authentication) |
| GET | `/api/me/claimable` | signed in | Unlinked active players, for "Which player are you?" |
| POST | `/api/me/claim` | signed in | Link the signed-in login to a player (`{ player_id }`; 409 if taken) |
| GET | `/api/config` | — | Club config |
| GET | `/api/leaderboard` | — | Ranked players with id, name, hc_member_id, preferred_name |
| POST | `/api/leaderboard/import` | admin | Replace full leaderboard from names array |
| GET | `/api/sessions` | — | List sessions (date, status, attendee_count) |
| POST | `/api/sessions` | admin | Create session for a date |
| GET | `/api/sessions/:date` | — | Full session (attendees, boxes, scores, lb before/after) |
| PUT | `/api/sessions/:date/attendance` | admin | Toggle player attendance |
| PUT | `/api/sessions/:date/boxes` | admin | Save box assignment (transitions to `games`) |
| PUT | `/api/sessions/:date/score` | admin | Update a single set score |
| POST | `/api/sessions/:date/close` | admin | Close session + write final leaderboard |
| POST | `/api/sessions/:date/reopen` | admin | Reopen closed → games |
| POST | `/api/sessions/:date/reopen-attendance` | admin | Reopen games → attendance (clears boxes) |
| DELETE | `/api/sessions/:date` | admin | Delete session |
| GET | `/api/players/:id` | admin | Get player profile, incl. `login: { email } \| null` |
| POST | `/api/players/:id/unlink` | admin | Remove the player's Google sign-in link |
| PUT | `/api/players/:id` | admin | Update email, hc_member_id |
| DELETE | `/api/players/:id` | admin | Archive/delete player |
| POST | `/api/players` | admin | Add new player mid-session |
| GET | `/api/hc/members?q=` | admin | Search HelloClub members by name |
| POST | `/api/hc/sync` | admin | Sync session attendees to HelloClub event |

---

## Authentication

**BetterAuth** (`worker/src/better-auth.ts`), mounted at `/api/auth/*` (Drizzle adapter on D1, `admin` plugin, Google provider). Since S4b it is the only sign-in.

- **Signing in:** "Sign in with Google" in the browser calls `POST /api/auth/sign-in/social` and follows the returned URL to Google (redirect flow; needs `GOOGLE_CLIENT_SECRET` and the redirect URLs `https://<host>/api/auth/callback/google` registered on the Google OAuth client for prod and staging). Google sends the browser back to the page it started on, signed in. The session is an HttpOnly cookie (`__Secure-better-auth.session_token` on https), sent automatically with every same-origin API call.
- **Who's signed in:** `GET /api/me` → `{ signedIn, isAdmin, name?, player? }`; the browser asks on load. Sign out: `POST /api/auth/sign-out`.
- **Roles:** `user.role` is `admin` or `user` (player). `requireAdmin` passes only a session whose user is `admin`. Any Google account can sign in (V1); new accounts are players.
- **Linking a login to a player (V1):** `/api/me` links a login that has no player to the one active player whose HelloClub email (`players.email`) is the Google email, ignoring case. If several active players have that email (linked or not), it doesn't auto-link. Otherwise the browser shows "Which player are you?" (`GET /api/me/claimable`, `POST /api/me/claim`): any unlinked active player, linked immediately; a player someone already claimed, or a second player for one login, is refused. Admins see a player's Google sign-in on their page and can Unlink it. Google only for now; other sign-in methods are parked (MIGRATION.md, Follow-ups).
- **Tables:** `user`, `session`, `account`, `verification`; `players.user_id` links a player to their login. Migration 0011 carried over every Google link from the old app (Google's `sub` is the account id, so the same Google account signs in to the same user) and made owners/admins `admin`; 0012 dropped the old tables (`player_auth_profiles`, `roles`, `player_roles`). Facebook links weren't carried over (per-app ids); those players' emails are on `players.email`.

**Staging test accounts.** On staging only, `TEST_LOGIN = "1"` (in `[env.staging.vars]`) turns on email + password sign-in for two synthetic accounts: **Test Admin** (`test-admin@staging.invalid`, admin) and **Test Player** (`test-player@staging.invalid`, player). Sign-up is off; `testLoginEnabled` refuses to start it for any URL that isn't staging or localhost, and a test checks prod-like config rejects password sign-in. Their password is the `TEST_LOGIN_PASSWORD` GitHub secret (the staging refresh re-creates the accounts after loading prod's data, via `worker/scripts/seed-test-users.mts`) and, for local scripts, `e2e/.env.staging` (gitignored). Passwords use PBKDF2 via WebCrypto (`src/test-login.ts`), because BetterAuth's default scrypt is too CPU-heavy for the free plan. Sign in from scripts with `POST /api/auth/sign-in/email` (send an `Origin` header), or `{ "as": "test-admin" }` in `e2e/shot.mjs`.
---

## HelloClub sync

**Server-side** — no CORS proxy needed. Called via `POST /api/hc/sync` with `{ session_date }`.

Flow:
1. Fetch events for the session date from HC API, sorted by `startDate`
2. Find event whose name includes `'Senior Box'` (intentionally specific — `'Pre Box'` (6:30 PM warmup) sorts first and must not match)
3. Fetch current attendees for that event
4. For each ladder attendee: look up their `hc_member_id`; if not registered in HC, POST them via `eventAttendee/many`
5. Returns a `{ log: [{text, type}] }` array rendered in the sync modal

**HC member linking:** Admin can open a player profile (`/players/:id`), search HC members by name via `GET /api/hc/members?q=`, and link the result. This stores `hc_member_id` (HC's MongoDB ObjectId string) on the player row.

**Known issue (fixed 2026-07-22):** Before the `'Senior Box'` fix, the match used `'Box'`, which caused sync to target `'Pre Box'` for sessions on 2026-07-14 and 2026-07-21. Those sessions need manual remediation (add affected players to the correct HC event directly).

---

## Frontend

Single-page app. No framework build step — Alpine.js and Tailwind are loaded from CDN in `index.html`. The rules come from the bundled `js/dist/rules.js` (see below).

**`js/app.js`** — one large `appData()` function that is the Alpine component. Key state:
- `view` — `'home' | 'session' | 'player'`
- `session` — current session object (date, status, attendees, boxes, leaderboardBefore/After)
- `leaderboard` — ranked name array; `_playerIds`, `_playerHcIds`, `_playerPreferredNames` — parallel lookup maps
- `player` — current player profile object (player view)
- `hcSync` — modal state for HC sync log

Routing is hash-based: `/` home, `/:date` session, `/players` leaderboard tab, `/players/:id` player profile.

**`js/storage.js`** — thin HTTP client. All API calls go through `apiJSON(path, opts)`; the BetterAuth session cookie goes with them automatically. `me()` asks who's signed in, `signInWithGoogle()` starts the redirect, `logout()` ends the session.

**Rules (`js/dist/rules.js`)** — the box-night rules live in `worker/src/domain/` (pairings, box sizes, custom layouts, set and match scoring, standings, 2-up-2-down), ported from `club-next` in S1 and shared by the Worker and the browser. `worker/src/browser/algorithm.ts` exposes them to `app.js` as the same globals the old `js/algorithm.js` had: `boxSizeOptions(n)`, `splitBySizes(sortedPlayers, sizes)`, `buildBoxesFromLayout(layout)`, `parseBoxLayout(text, nameByDisplay)`, `getPairings(size)`, `getSitout(box, matchIndex)`, `computeBoxStandings(box, lbBefore)`, `isValidSet`, `getMatchStatus`, `allScoresComplete`, `applyLeaderboardUpdate(boxes, lbBefore)`, `nextTuesday`, `formatDate`. Players are names and scores are numbers or `''`, as before. A set is valid if it's a finished 21-, 15- or 11-point set. Live standings count a game as won only once it's finished, and ignore games with an invalid score.

---

## Secrets and environment variables

Set via Cloudflare dashboard or `wrangler secret put <NAME>`.

| Name | Type | Purpose |
|------|------|---------|
| `BETTER_AUTH_SECRET` | Secret | BetterAuth: signs session cookies (different on prod and staging) |
| `BETTER_AUTH_URL` | Var (toml) | BetterAuth: the deployment's origin (prod and staging differ) |
| `GOOGLE_CLIENT_SECRET` | Secret | BetterAuth's Google sign-in (redirect flow) |
| `TEST_LOGIN` | Var (toml) | `"1"` on **staging only**: password sign-in for the test accounts |
| `HC_API_KEY` | Secret | HelloClub API key — **prod only**, staging value is nonsense |
| `GOOGLE_CLIENT_ID` | Secret | Google OAuth client id (same client on prod and staging) |
| `HC_CLUB_ID` | Var (toml) | `northlandbadminton` — used in HC API base URL |
| `HC_CLUB_SLUG` | Var (toml) | `northland-badminton` — sent as `x-club` header |

---

## Development notes

- **No local dev server for the Worker** — changes are checked with `npm run typecheck` and `npm test` locally, then by deploying to staging. The frontend can be opened directly as a file for layout work, but API calls will fail without the Worker, and `npm run build:web` must have run once for the rules bundle.
- **CRLF warnings** — the repo uses LF line endings but the Windows working copy triggers CRLF conversion warnings on `git add`. These are harmless; the committed content is correct.
- **`club_id = 1` hard-coded** — multi-club support is future work. Do not add per-request club resolution without a plan for the routing/auth model.
- **Session ranks vs leaderboard:** `session_ranks` (formerly `session_lb`) stores the leaderboard snapshot for each session. `getLeaderboardPlayers` derives the current live ranking from the most recent session's ranks. (There is no `players.current_rank` column any more; 0002 dropped it.)
- **Box assignment algorithm:** each player plays every other player within their box; sizes 5/6/7 sit out 1/2/3 players per match — derived generically by `getSitout()` from each match's pairing (nobody hardcodes sit-out indices per size). Pairing schedules for all four sizes (`worker/src/domain/pairings.ts`) come from the club's printed score-sheet PDFs (`box6.pdf`, `box7.pdf` — the 4/5 originals aren't kept in-repo). Clicking "Assign Boxes" opens a modal (always, even when there's only one option — see future-work note below) offering every way to split attendees into boxes of 4/5/6, computed by `boxSizeOptions(n)` and ordered most-boxes-first (default selection); exactly 7 attendees instead get the single box-of-7 option, since a 7-box is only ever used as a last resort. Each option's layout (player names per box) comes from `splitBySizes(sortedAttendees, sizes)`, which slices attendees (sorted by leaderboard rank, boxes ascending in size) into the chosen boxes. If there's a previous layout for the session — the current boxes on Reassign, or the boxes cleared by Re-open Attendance (kept in memory only, as `_previousBoxLayout`, so lost on reload) — it's offered first, minus anyone no longer attending, and selected by default. A "Custom" option copies the selected option's layout into an editable textbox (one box per line, comma-separated display names exactly as printed — full names are rejected); re-selecting an option then Custom resets it. Every option is validated through `parseBoxLayout` (every attendee placed exactly once, boxes of 4–7) before `buildBoxesFromLayout` turns it into boxes with fresh pairings. Typical mid-session use: someone leaves → Re-open Attendance → untick them → Assign Boxes (previous layout is preselected, minus them). `boxSizeOptions` also fixed a latent gap: 11 attendees used to be Frobenius-non-representable by 4s/5s alone and hit a dead-end fallback — now resolved as 1 box of 5 + 1 box of 6.
- **Pairing tables live in one place** (`worker/src/domain/pairings.ts`). They used to be duplicated in `js/algorithm.js` and `worker/src/db.ts`, and adding sizes 6/7 to only the client copy shipped a bug: those boxes came back from the API with empty pairings. Since S1 both the browser bundle and `db.ts` (`getPairing`, used when reading boxes back from D1) import the shared tables.

## Considerations for future work

- i want to increase visual consistency/increase code re-use across pages. if the same or similar job is being done by multiple components or in different ways, look for opportunities to reduce duplication.
- new code should fit neatly into existing architecture; if it doesn't we might need to refactor first


## Known issues

- **Tailwind arbitrary values don't work:** the app loads the static Tailwind 2.2.19 build from CDN, which has no arbitrary values, so classes like `max-h-[65vh]` (three in `index.html`) are silently ignored. Use inline styles for such sizes (as the "Which player are you?" modal does). Goes away with S5.
- **Ladder import while a session is open:** `replaceLeaderboard` writes the imported order to the latest session's *after* ladder, but an open session (attendance/games) shows its *before* ladder, so the imported order doesn't appear (the ladder shows the old order, minus anyone the import archived). Fine when the latest session is closed (the usual case). Found in S2; behaviour kept as-is for now.

## Future work

- need a better handling for user display names. we now have a concept of preferred names and some special handling of players names to make them shorter. I think we should just give everyone a unique display name (following similar rules as we do now for shortening) and just use those (and update user provisioning accordingly).
- score entry UI is ok for desktop, not great for mobile. in the future I expect players to be entering scores themselves rather than me copying them from paper score sheets
- should consider better score sheets in the interim; we could just have names instead of numbers, and maybe we don't need the grid as such, just one score entry per game. also clear set 1/2/3 slots. but would probably still need to have some way for players to calculate final placements (even though I ignore it, but some people just enjoy it better on paper).
- stats is currently a standalone experiment, needs refining and working into the app
- need to think about multi-tenancy. e.g. teenage kids group runs their box games the same way
- whatsapp integration isn't really working - for whatever reason when I click "open app" from that whatsapp link it doesn't find my WA on my samsung phone, so I have to manually copy the text in. 
- might want to store HC sync results somewhere as well
- maybe improve HC sync to mark everyone who attended as attended in HC as well 