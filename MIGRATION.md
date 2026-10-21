# Migration plan: evolving `club` into the new architecture

> Agreed 2026-10-21. Instead of replacing this app with the from-scratch rewrite in `C:/dev/src/club-next`, we convert **this** app gradually. It stays live and usable every session night throughout. `club-next` becomes a **reference**: its decisions, tested rules code, components and user stories are carried over piece by piece. It will probably be archived once nothing more is needed from it.

---

## How we work (with Claude)

- **One step per session, PR-sized.** Each step leaves the app working, can be reverted on its own, and is either *structural* (nothing visible) or *visible* (players notice). Aim to alternate, so the effort keeps paying off.
- **Plan first, every step.** At the start of a step Claude proposes:
  - what changes;
  - what gets copied from `club-next`, with exact file paths;
  - how it will be tested;
  - how it would be rolled back.

  Nothing is built until the developer approves.
- **This file is the shared memory.** Update the step table below at the end of every step (status, what was done, anything learned). Decisions made along the way go in the "Decisions log" at the bottom (or in `club-next/decisions.md` until that's archived). Keep `AGENTS.md` accurate about the *current* state of the app.
- **Safety rules:**
  - Work on a branch. Deploy to **staging** (`npm run deploy:staging` in `worker/`) first.
  - Before any schema change, refresh staging from prod (the GitHub Action) and rehearse the migration on real data.
  - Run the browser checks against staging (Playwright, ported from `club-next/e2e/`).
  - Claude may deploy to staging and prod as required.
  - Every prod schema change has a backup first (`wrangler d1 export club-prod --remote`) and a written rollback (D1 Time Travel and/or a down-migration). Worker code rollbacks use `wrangler rollback`.
- **HelloClub writes** stay exactly as they are today (the existing sync) until a step explicitly changes them. Any *new* HelloClub write behaviour runs in dry-run on staging first.
- **Priorities are decided ad hoc.** The order below is a sensible default, not a commitment. The visible changes list is a menu to pick from.

---

## Visible changes (menu; prioritise ad hoc)

Improvements players or admins will notice, mostly already prototyped in `club-next`. Each depends on some structural steps (in brackets).

| # | Change | Prototype in `club-next` | Needs |
| --- | --- | --- | --- |
| V1 | **Players sign in** (Google; Facebook later), matched to their player record by HelloClub email, or by picking themselves | `src/server/auth.ts`, `routes/welcome.tsx`, `services/people.ts` (`autoLinkByEmail`) | S4, S3 (person/login) |
| V2 | **Players mark themselves or others as coming**, with a record of who marked whom | `routes/.../attendance.tsx` | V1, S3 |
| V3 | **Players enter scores on their phones**, with live updates on every screen and no silently dropped scores | `live/*`, `components/BoxCard.tsx`, `ScoreSheet.tsx` | V1, S5, S6 |
| V4 | **Live box standings** during the night (and projected ladder movement) | `components/BoxCard.tsx`, `domain/standings.ts` | S1 |
| V5 | **Stats:** session summary, player page, club stats (ladder movement, distributions) | `domain/stats.ts`, `services/stats.ts`, routes `summary`, `people/$id`, `_tabs/stats` | S1, S2 (S5 for the new UI) |
| V6 | **Display names** (default first name; full name only when names clash) | `domain/names.ts` | S3 |
| V7 | **OpenSkill rating** shown next to the ladder; ladder sort/filter ("played in last 3 months") | `domain/rating.ts`, `services/clubs.ts` (`ladderRows`) | S1, S2 |
| V8 | **Multiple clubs** (Thursday juniors) with per-club settings (points per set, box sizes, OpenSkill on/off) | `services/clubs.ts`, `components/ClubForm.tsx` | S3 |
| V9 | **Sessions created automatically** about an hour before the HelloClub event; manual create lists HelloClub events | `server/jobs.ts`, `components/CreateSessionModal.tsx` | S7, S3 (session id + HelloClub event id) |
| V10 | **Better HelloClub sync:** marks *everyone* who came as attended, stores results, re-run button, clear failures for unlinked people | `server/jobs.ts` (`hcAttendanceSync`), `routes/jobs/*` | S7 (live writes need verifying first) |
| V11 | **Admin notifications** (bell with recent items: sync results, failures) | `components/AppHeader.tsx`, `fns/jobs.ts` | S7, S5 |
| V12 | **Retiring a player mid-session** (walkovers; partner loses too) | `domain/scoring.ts` (`walkoverSets`), `services/sessions.ts` (`retirePlayer`) | S1 |
| V13 | **Light/Dark toggle** with words; first visit follows the device | `components/ColorSchemeToggle.tsx` | S5 |
| V14 | **New UI** (Mantine, phone-first), page by page | `components/*`, `/dev/gallery` | S5 |
| V15 | **WhatsApp share fix** (the Samsung "open in app" issue) and session/ladder links | `routes/.../summary.tsx` | — |
| V16 | **Ladder import, people list, person admin page** (link HelloClub member, move login, role) | `routes/clubs/$club/import.tsx`, `routes/people/*` | S2, S3, V1 |

Not changing: printable score sheets stay as they are.

---

## Structural steps (default order)

Status: ⬜ not started · 🟨 in progress · ✅ done

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| S0 | **Foundations:** a TypeScript test setup (Vitest) + CI (typecheck, tests) for `worker/`; tracked D1 migrations (`wrangler d1 migrations apply`, backfilling `d1_migrations` for files applied by hand); staging deploy as routine; port the Playwright helpers (`club-next/e2e/shot.mjs`) and point them at staging | ✅ | 2026-10-21. Vitest + `npm run typecheck` (fixed the existing type errors: `requireAdmin` now uses Hono's `createMiddleware`) + `.github/workflows/ci.yml`. First test: server vs client pairing tables. Prod and staging `d1_migrations` backfilled (only 0001 was tracked); use `npm run db:migrate:*` from now on. Wrangler 3 → 4. `deploy-staging.yml` workflow. `e2e/shot.mjs` (signed out; Google-only sign-in). Found and fixed: the Worker was publicly serving the docs, `temp/` and `deploy.sh` (now in `.assetsignore`). Lint moved to S1 |
| S1 | **Shared rules code + frontend build step.** Bring `club-next/src/domain/*` (pairings, boxes, scoring, standings, ladder, names, stats, rating) and its tests. A small build (Vite or esbuild) bundles it for the browser, so client and server use one copy. This removes the duplicated pairing tables (a known past bug). `js/algorithm.js` becomes a thin wrapper, then goes away. | ✅ | 2026-10-21, in prod (PR #3). Ported pairings, boxes, scoring, standings, ladder, close-preview into `worker/src/domain/` (names, stats, rating wait for V6/V5/V7). esbuild bundles `worker/src/browser/algorithm.ts` (the old `algorithm.js` API on the new rules) to `js/dist/rules.js`, built by wrangler on every deploy; `js/algorithm.js` removed; `db.ts` uses the shared pairing tables. Safety net: characterization tests written against the old code first, side-by-side random tests (old vs new, 3,000 cases per rule), mutation-checked; replay of all 20 closed sessions: old = new on every one (5 early sessions differ from their stored ladders under both, from hand edits). ESLint + Prettier on `worker/` (club-next's config), in CI. Developer run-through on staging (11 attendees, 11/15-point sets, close) matched old = new = stored. New helper: `e2e/compare.mjs` (diff pages on prod vs staging). |
| S2 | **Drizzle over the existing schema.** `drizzle-kit pull` from D1, then replace raw SQL in `worker/src/db.ts` a few queries at a time. No schema change | ✅ | In prod (PRs #5, #6). **S2a (reads), 2026-10-21:** real local D1 for tests (wrangler `getPlatformProxy`) built from the migrations, checked against prod's schema; characterization tests for every query and the API (fixture club, made-up names); `worker/src/db/schema.ts` written by hand (pull needs a native driver) with a drift test against the migrations; all reads converted, same signatures; unused auth/role helpers removed. Prod vs staging: all 24 API responses and pages identical. **S2b (writes), 2026-10-22:** all writes converted; `db.ts` has no raw SQL. Real-scale tests (160-player ladder, 8 full boxes) recorded first against the raw SQL, for D1's 100-parameter limit; 10 deliberate breakages caught; a full session night replayed on a copy of prod data through old and new writes left every table identical after every step. Found two pre-existing bugs (AGENTS.md, Known issues), kept as-is. Developer run-through on staging passed. |
| S3 | **Small schema changes that only add things,** one migration each, rehearsed on staging with prod data: display names; sessions keyed by id (URLs keep working for date links); check-in audit (who/when); person vs login separation; per-club settings; ladder snapshot model (`club-next` decisions: chained before/after snapshots + adjustments) | ⬜ | Split into sub-steps when planned |
| S4 | **Auth → BetterAuth** (Google first). Existing admin JWT sign-in keeps working until the switch. Roles collapse to `admin`/`player` (`club-next/decisions.md`, "Roles") | 🟨 | **Plan (2026-10-22):** S4a server + test sign-in, then S4b switch + clean-up (no grace period: the developer is the only user). **S4a, 2026-10-22:** BetterAuth mounted alongside the old login; migration 0011 (auth tables, `players.user_id`, Google links → users/accounts, owner/admin → `admin`; applied to prod: 88 users, 2 admins, 91 Google accounts); staging-only test accounts (Test Admin / Test Player) and `e2e/admin-flow.mjs`, so writes are verified on staging without a manual run-through. **S4b, 2026-10-22:** "Sign in with Google" through BetterAuth's redirect (Google client secret and redirect URLs added in Google Cloud Console), `/api/me`, a non-admin Google account is signed out again with a message; old login, app JWT and `JWT_SECRET` removed; migration 0012 drops `player_auth_profiles`/`roles`/`player_roles` (applied to prod after the S4b code is live, since the old code still used them). Checked on staging with `admin-flow.mjs`, `compare-api.mjs` and new browser checks (`e2e/auth-ui.mjs`); the developer's real Google sign-in tried on staging. |
| S5 | **Frontend → React + TanStack Start + Mantine, page by page.** Start takes over the Worker entry; the old Alpine `index.html` keeps serving every route not yet migrated. Suggested order: stats → player page → ladder → club admin pages → session night | ⬜ | Each page is its own step; components come from `club-next/src/components` and the gallery |
| S6 | **Live session Durable Object** as the write path for session night (scores, check-ins, boxes, close), as designed in `club-next/src/live/*` | ⬜ | Needs S4, S5 (session page) |
| S7 | **Background jobs** (job runner Durable Object, cron) and notifications | ⬜ | Needed by V9–V11 |

---

## Follow-ups (not steps, but don't lose them)

- **Data backups beyond 7 days.** D1 Time Travel already lets us restore prod to any minute in the last 7 days (free plan; `wrangler d1 time-travel restore club-prod --timestamp=...`, which rolls back the whole database). For longer, agreed design (2026-10-22), not yet built:
  - A nightly GitHub Action (about 3am NZ) runs `wrangler d1 export club-prod` and commits the dump to a **private** repo, e.g. `seminolas/club-backups`; git history keeps every night's copy. Never store dumps in `club` itself or its Action artifacts: that repo is public and the data has names, emails and HelloClub ids.
  - Needs: the private repo, and a fine-grained token limited to it ("Contents: read and write") stored as a secret in `club`, created by the developer in the browser. Reuses the existing Cloudflare secrets.
  - A manual "Load a backup into staging" workflow (staging-refresh with a chosen dump) as the restore drill.
  - Alternative to decide on when building: **R2** (Cloudflare's own suggestion). Its free tier (10 GB-month storage, 1M writes, 10M reads a month, free egress) easily covers a ~1 MB nightly dump. Activating it reportedly asks for a card or PayPal as verification, charging only beyond the free tier (per third-party guides; check the dashboard). For: stays in Cloudflare, no GitHub token, lifecycle rules can expire old dumps. Against: a payment method on file with no hard spending cap, and plain files rather than a browsable, diffable history. Cloudflare only offers alerts, not caps (budget alerts by dollar amount; R2 usage notifications by bytes/requests). If we choose R2: private bucket, an API token that can only write to that bucket, and a $1 budget alert.

- **A known bug, deliberately not fixed yet** (the requirements may change; see AGENTS.md, Known issues): a ladder import while a session is open doesn't show. Revisit with ladder import. (The other one, deleting a player with a login or role but no game data failing, went away in S4b: 0012 dropped the tables that blocked it.)

## Where things are in `club-next` (reference)

- `decisions.md`, `guidelines.md`, `architecture.md`, `user-stories.md`, `open-questions.md`: the thinking behind it all. Still valid unless a migration step changes it.
- `src/domain/`: pure TypeScript rules with tests (`domain.test.ts`). The first thing to port.
- `src/server/services/`: database-injected services with tests (`sessions.test.ts`, `jobs.test.ts`). Port when the matching feature moves.
- `src/components/` + `/dev/gallery`: the UI vocabulary.
- `e2e/`: browser-check helpers.

---

## Decisions log (migration-specific)

- **2026-10-21:** Gradual migration of `club` instead of switching to the rewrite. The developer tested `club-next`, liked the direction, but wants to proceed step by step on the live app. A frontend build step is OK from S1. What happens to `club-next` will be decided later (probably archived).
- **2026-10-21 (S1):** Set validation accepts any of 21-, 15- and 11-point sets (real sessions mix them), instead of `club-next`'s single points-per-set setting; a per-club setting can come with V8.
- **2026-10-21 (S1):** Live box standings count a game as won only once it's finished, and ignore games with an invalid score until fixed (before: a 1–0 lead counted as a win, invalid scores counted). The one visible change in S1. Closing is unaffected (it needs every game finished).
- **2026-10-21 (S1):** Where the live app and `club-next` disagree, the live app's behaviour wins unless agreed otherwise. Kept from the live app: a match with a half-entered set is "in progress" even if another set is invalid; custom box layouts (`parseBoxLayout`), which `club-next` lacked.
- **2026-10-21 (S1):** Tie-break for players not on the ladder-before is moot: the app only adds players during attendance, straight onto the ladder, so it can't happen.
- **2026-10-21 (S1):** Lint and formatting apply to `worker/` only; `js/` and `index.html` stay as they are until S5 replaces them.
- **2026-10-21 (S2):** The SQL migrations in `worker/migrations` stay the source of truth for the schema; `worker/src/db/schema.ts` mirrors them for typed queries, with a test that fails on drift. How new schema changes are written (by hand, or generated with `drizzle-kit generate`) is decided when S3 is planned.
- **2026-10-21 (S2):** Database tests run on a real local D1 (wrangler's `getPlatformProxy`) rather than better-sqlite3, so they use the same engine as prod. Fixtures use made-up names because the repo is public.
- **2026-10-21:** A reusable table + actions component is being designed separately in `C:/dev/src/club-table-lab` (its own repo; `club` and `club-next` are read-only there). When accepted, its `HANDOVER.md` describes how it's adopted in S5.
