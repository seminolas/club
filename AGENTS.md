# AGENTS.md — Northland Badminton Club

Comprehensive context for AI agents working on this codebase.

---

## Deployment topology

```
GitHub repo: seminolas/club  (branch: master)
│
├── Static assets (index.html, js/, data/) ← served by Cloudflare Workers assets
└── worker/                                ← Cloudflare Worker (Hono API)
    ├── src/index.ts                       ← all API routes
    ├── src/auth.ts                        ← Google JWT verification + requireAdmin middleware
    ├── src/db.ts                          ← all D1 queries
    ├── src/types.ts                       ← shared TypeScript types
    └── migrations/                        ← D1 schema migrations (applied manually)
```

**Production URL:** https://club.vilhelmas-f78.workers.dev/  
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

There is no build step for the frontend. The Worker compiles `src/index.ts` via wrangler on deploy.

**If wrangler prompts to create `wrangler.jsonc`:** decline. The existing `wrangler.toml` is correct. The proposed config uses `directory: "."` (worker subdirectory) instead of `directory: ".."` (repo root), which would break static asset serving.

**Commit before deploying** — wrangler deploys from the filesystem, not from git. It's easy to deploy uncommitted changes. Check `git status` first.

---

## Repo structure

```
/
├── index.html          # main SPA shell
├── js/
│   ├── app.js          # Alpine.js app component (all UI logic)
│   ├── storage.js      # HTTP client — wraps all /api/* calls
│   ├── algorithm.js    # box assignment + leaderboard update logic (pure functions)
│   └── csv.js          # CSV import/export helpers
├── data/
│   └── helloclub-members.json  # legacy HC member mapping (unused in Workers version)
├── stats.html          # analytics dashboard (live-fetch, Observable Plot + Grid.js)
├── stats2.html         # analytics dashboard v2
└── worker/
    ├── wrangler.toml
    ├── src/
    │   ├── index.ts    # Hono app, all route handlers
    │   ├── auth.ts     # verifyGoogleToken, signJwt, requireAdmin middleware
    │   ├── db.ts       # all D1 queries (no ORM)
    │   └── types.ts    # Env, JwtPayload, BoxInput, SessionStatus, etc.
    ├── migrations/     # SQL migration files, applied manually via wrangler d1 execute
    └── scripts/        # one-off data repair scripts (not production code)
```

**Legacy:** `C:/dev/src/temp-badminton/` is the old GitHub Pages version backed by GitHub API for storage. It is no longer active. All production work happens in this repo.

---

## Database schema

D1 (SQLite). All queries are in `worker/src/db.ts` — no ORM.

```sql
clubs           -- id, name, short_name, config (JSON)
players         -- id, club_id, name, current_rank, hc_member_id, preferred_name, archived_at
sessions        -- id, club_id, date (YYYY-MM-DD), status, created_at, closed_at
session_ranks   -- session_id, player_id, rank_position  (replaces old session_lb)
attendees       -- session_id, player_id
boxes           -- id, session_id, box_number
box_players     -- box_id, player_id, position (0-indexed)
matches         -- id, box_id, match_number
match_sets      -- match_id, set_number, score_a, score_b
match_players   -- match_id, player_id, pair (0|1)
player_auth_profiles -- id, player_id, provider ('google'), provider_id, email
roles           -- id, name ('owner'|'admin'|'scorer'|'player')
player_roles    -- player_id, role_id
```

`club_id = 1` is hard-coded throughout (`CLUB_ID = 1` in `index.ts`). Multi-club support is noted as future work.

**Migrations are applied manually:**
```bash
npx wrangler d1 execute club-prod --remote --file=worker/migrations/XXXX_name.sql
```
Migrations are numbered sequentially. There is a naming collision at `0002` (two files); both were applied. New migrations should start from `0009`.

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

All under `/api/*`. Auth routes are open; everything else requires `Authorization: Bearer <JWT>` via `requireAdmin` middleware (checks `roles` array includes `owner` or `admin`).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | — | Exchange Google id_token for app JWT |
| GET | `/api/config` | — | Club config + Google client ID |
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
| GET | `/api/players/:id` | admin | Get player profile |
| PUT | `/api/players/:id` | admin | Update email, hc_member_id |
| DELETE | `/api/players/:id` | admin | Archive/delete player |
| POST | `/api/players` | admin | Add new player mid-session |
| GET | `/api/hc/members?q=` | admin | Search HelloClub members by name |
| POST | `/api/hc/sync` | admin | Sync session attendees to HelloClub event |

---

## Authentication

Google Identity Services (GIS) handles the OAuth flow entirely client-side. The browser receives a Google `id_token`, which is POSTed to `/api/auth/login`. The Worker verifies it against Google's public keys (fetched and cached), then issues a signed app JWT.

JWT payload:
```typescript
{ sub: string; player_id: number; club_id: number; roles: string[]; exp: number }
```

Roles: `owner`, `admin`, `scorer`, `player`. Only `owner` and `admin` pass `requireAdmin`. A player must have a `player_auth_profiles` row linking their Google `sub` to a `players` row — this is set up by an admin via the player profile UI.

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

Single-page app. No framework build step — Alpine.js and Tailwind are loaded from CDN in `index.html`.

**`js/app.js`** — one large `appData()` function that is the Alpine component. Key state:
- `view` — `'home' | 'session' | 'player'`
- `session` — current session object (date, status, attendees, boxes, leaderboardBefore/After)
- `leaderboard` — ranked name array; `_playerIds`, `_playerHcIds`, `_playerPreferredNames` — parallel lookup maps
- `player` — current player profile object (player view)
- `hcSync` — modal state for HC sync log

Routing is hash-based: `/` home, `/:date` session, `/players` leaderboard tab, `/players/:id` player profile.

**`js/storage.js`** — thin HTTP client. All API calls go through `apiJSON(path, opts)` which attaches the Bearer token from `localStorage`. `autoLogin()` restores the JWT from storage on page load.

**`js/algorithm.js`** — pure functions: `assignBoxes(sortedPlayers)`, `computeBoxStandings(box, lbBefore)`, `applyLeaderboardUpdate(boxes, lbBefore)`. No side effects; unit-tested in `temp-badminton/tests/algorithm.test.js`.

---

## Secrets and environment variables

Set via Cloudflare dashboard or `wrangler secret put <NAME>`.

| Name | Type | Purpose |
|------|------|---------|
| `JWT_SECRET` | Secret | Signs and verifies app JWTs |
| `HC_API_KEY` | Secret | HelloClub API key — **prod only**, staging value is nonsense |
| `GOOGLE_CLIENT_ID` | Secret | Google OAuth client ID for GIS |
| `HC_CLUB_ID` | Var (toml) | `northlandbadminton` — used in HC API base URL |
| `HC_CLUB_SLUG` | Var (toml) | `northland-badminton` — sent as `x-club` header |

---

## Development notes

- **No local dev server for the Worker** — changes are tested by deploying to staging. The frontend can be opened directly as a file for layout work, but API calls will fail without the Worker.
- **CRLF warnings** — the repo uses LF line endings but the Windows working copy triggers CRLF conversion warnings on `git add`. These are harmless; the committed content is correct.
- **`club_id = 1` hard-coded** — multi-club support is future work. Do not add per-request club resolution without a plan for the routing/auth model.
- **Session ranks vs leaderboard:** `session_ranks` (formerly `session_lb`) stores the leaderboard snapshot for each session. `getLeaderboardPlayers` derives the current live ranking from the most recent session's ranks. The `players.current_rank` column exists but is not the source of truth for ordering.
- **Box assignment algorithm:** boxes of 4 or 5 players; each player plays every other player. With 5 players, one sits out per match (rotation defined in `SITOUT_5` in `algorithm.js`). Players are sorted by leaderboard rank before assignment; the top N go in box 1, next N in box 2, etc.
