# UI port: `club-table-lab` → `club` (S5)

> Written 2026-10-24 with the developer. This is the working plan **and the shared memory** for porting the new UI. It's long-running work that will outlive any one context window: **read this file first** in every session that works on it, and update **Status** and **Log** at the end of every step.
>
> Related: `MIGRATION.md` (S5 is this work), `AGENTS.md` (how the app works today), the lab at `C:/dev/src/club-table-lab` (`HANDOFF.md`, `DECISIONS.md`: the reasoning behind every lab choice; read the relevant section before porting a screen).

---

## Status

Status: ⬜ not started · 🟨 in progress · ✅ done (PR open) · 🚀 merged

| Step | What | Status | PR / notes |
| --- | --- | --- | --- |
| U0 | This plan; MIGRATION.md updated | ✅ | branch `ui-port-plan` |
| U1 | TanStack Start in the Worker, app shell at `/new/`, sign-in | ✅ | branch `u1-start-shell` (on `ui-port-plan`) |
| U2 | `ListTable` + landing page: Players (ladder), Sessions | ✅ | branch `u2-landing` (on `u1-start-shell`) |
| U3 | Player page (admin) | ✅ | branch `u3-player-page` (on `u2-landing`) |
| U4 | Session page frame + Check-in step + Assign boxes | ⬜ | |
| U5 | Boxes step: score entry, live channel, Close | ⬜ | |
| U6 | Results step: stats table, Share, HelloClub sync | ⬜ | |
| U7 | Printing: sign-in sheet, score sheets (cards, grid) | ⬜ | |
| U8 | Legibility pass, polish, phone checks | ⬜ | |
| U9 | Cutover: new UI at `/`, old links redirect, Alpine removed | ⬜ | developer tries `/new/` on a real session night first |

---

## How to work on this (read every session)

- **Agreed autonomy (developer, 2026-10-24):** go step to step without waiting for approval, as long as the step follows this plan. One PR per step, **stacked** (each branch based on the previous step's branch; the developer merges them in order). Deploy every step to **staging** and run the checks. **Additive prod migrations are allowed after a backup** (`backup-prod.yml` run, or `wrangler d1 export`), since the new UI is only at `/new/`. Never merge; never deploy prod by hand (merging deploys).
- **When something isn't covered here,** don't guess on anything user-visible: pick the option closest to the live app's behaviour, write the question under **Open questions** with the choice made, and carry on.
- **Missing functionality is a mistake, not a decision** (developer): if the live app does something the lab doesn't show, port it, in the lab's style. If it's unclear how, add an open question.
- **Behaviour wins over looks:** the live app's rules, permissions and confirms are kept unless this plan says otherwise. Look and layout come from the lab.
- **Copy, don't reinvent:** take the lab's code where this plan says so; check `DECISIONS.md` before changing anything a lab decision covers.
- **The repo is public:** screenshots of staging show real member names. **Never commit screenshots**; keep them in the scratchpad (or `shots/`, gitignored). Test fixtures stay made-up.
- **Context:** this is big. Keep tool output out of context (subagents for wide searches), and write learnings into this file's **Log** as you go, not only at the end.
- **Every step ends with:** typecheck, lint, format check, unit tests; deploy to staging; the step's browser checks against `/new/` on staging; `compare-api.mjs` and `compare.mjs` (the old UI on `/` must be unchanged by every step before U9); screenshots at 390px and desktop looked at; this file updated; PR opened (body via `--body-file`).

---

## Decisions (2026-10-24, developer)

1. **Stack: TanStack Start, as S5 says.** Start takes over the Worker entry. The existing Hono API, BetterAuth and the live-session Durable Object keep working inside the same Worker.
2. **Rollout: side by side.** The new UI is served at **`/new/`** on staging and prod while it's built; the old UI stays at `/`, untouched. Both use the same data and the same live channel, so the developer can try `/new/` on a real session night. **U9** moves it to `/` in one cutover and redirects old links (including WhatsApp `#/` links).
3. **Close needs every score** (as today). "Close ›" is shown but disabled until every box is finished, with the reason. The lab's red "open matches won't count" variant is not used. The Close confirm gets the lab's ladder summary ("The ladder moves: 12 players up, 9 down").
4. **Check-in stays locked once boxes are assigned** (as today: Re-open check-in to add someone). The lab's "Late arrivals can still be checked in" text is dropped. Late arrivals are a separate future feature.
5. **Session actions are word buttons in the step's actions card** (the card above the table, as in the live app): printing, Share on WhatsApp, Sync to HelloClub. Re-opening, Reassign and Delete sit in "…". See "Session page" below.
6. **Scope extras:**
   - **No Stats tab.** The lab's Stats demo only explored showing ladder movement in a table, as Wrap-up does; that's the one thing ported, as the Results step (developer, 2026-10-24).
   - **"by Ema" (who marked someone coming): no**, not in this port.
   - **Light/Dark toggle (V13): yes.**
   - **Nights and Last played** (ladder columns, the 6-month "Last played" filter): **yes, if the reads stay well inside D1's free allowance** (see "Data").
7. **The lab is frozen.** Copy it as it is now; from then on `club` is the home of `ListTable` and the UI. Later experiments copy from `club`.

---

## What the lab is, and what to take

Lab: `C:/dev/src/club-table-lab` (not a git repo; read-only for us). Stack: Vite + React 19 + Mantine 9.6 + TanStack Table **9.3.1 (pin exactly)** + `@tabler/icons-react`. Theme: `createTheme({ primaryColor: 'teal', defaultRadius: 'md' })`, `defaultColorScheme="auto"`.

| Lab path | Take as | Into `club` |
| --- | --- | --- |
| `src/lab/*` (ListTable, columns, filters, FilterPanel, ColumnPanel, activeRow, cells, notices, CSS) + their `*.test.ts` | **Code, verbatim** (then lint/format) | `worker/src/app/components/list-table/` (final path decided in U1) |
| `src/demos/scoreSheet.ts` + test | Code | next to the score entry |
| `src/demos/GamesDetail.tsx` + `.css` | Code, adapted (permissions, saving, live) | Boxes step |
| `src/demos/shared.tsx` (`playedDate`, `nameLabels`, filters, `Dash`) + test | Code, adapted to real data | shared UI helpers |
| `src/clubnext/actions.tsx` (toasts), `names.ts` (display-name clash rule) | Code | shared |
| `src/demos/AppDemo.tsx` + `.css` | **Reference page** (structure, card, stepper, pinned bar, confirms): rewrite on real data | session page |
| Other demos (`Ladder`, `Sessions`, `Attendance`, `Games`, `SessionStats`) | Reference pages: column sets, filters, actions, wording | each screen |
| `src/data/*` | **Not ported** (made-up data) | replaced by real queries |
| `src/domain/*` | **Not ported**: identical to `worker/src/domain/*` (checked 2026-10-24; only a header comment differs) | import from `worker/src/domain` |
| `e2e/*.mjs` | Ideas for checks; rewritten against real pages on staging | `e2e/` |

Lab facts to carry over (from `HANDOFF.md`): keep `autoResetExpanded: false` (otherwise endless re-renders); Mantine Notifications need `containerWidth="min(27.5rem, calc(100vw - 2rem))"`; ListTable's phone check uses `useMediaQuery(..., { getInitialValueInEffect: false })`, which **needs an answer under SSR** (see U1); terminology is **match / game**, never "set" in the UI; status words everywhere: Not started / In progress / Finished / Check scores; legibility rule: nothing under 12px, informative grey gray-7 or darker.

---

## Architecture (target during the port)

- **One Worker, one deploy** (as now). Start's server entry (like `club-next/src/server.ts`) becomes the Worker `main`:
  - `/api/live/:date` WebSocket → `SessionRoom` (unchanged);
  - `/api/*` → the existing Hono app (unchanged; the old UI, e2e scripts and `compare-api.mjs` keep using it);
  - `/new/*` → TanStack Start (router `basepath: '/new'` until U9);
  - everything else → static assets: the old `index.html`, `js/` (unchanged).
- **Exact mechanics are U1's spike:** the `@cloudflare/vite-plugin` build makes the client bundle the assets directory, while the old UI is served from the repo root today (`[assets] directory = ".."`). U1 proves one arrangement that serves both, keeps `wrangler.toml` (or moves to `wrangler.jsonc` deliberately, updating AGENTS.md's warning), keeps `deploy.sh`/Workers Builds working, and keeps `.assetsignore`'s protection (nothing private becomes public).
- **Data in the new UI:** TanStack Query + Start **server functions**. Reads and writes call the **same service functions as the Hono routes**: U1/U2 extract each route's body from `worker/src/index.ts` into small services (`worker/src/services/*`) so REST and server functions can't drift (the API characterization tests guard this). Admin checks and `notifyLive` live in the services. Score writes keep going over the live WebSocket.
- **Auth:** BetterAuth as now (`getSession` from the request headers in server functions). Same `/api/auth/*`; the session cookie is shared by `/` and `/new/`.
- **Rules:** the UI imports `worker/src/domain/*` directly. `worker/src/browser` and `js/dist/rules.js` stay for the old UI until U9.
- **Versions:** pin exactly what's installed (no `latest`): Start/Router, Query, Mantine, TanStack Table 9.3.1.
- **Package manager:** npm in `worker/` (as now), not pnpm.
- **Checks:** CI's typecheck/lint/format/test cover the new code (it's under `worker/`).

---

## Screens: today → new

### App shell (all pages)

| Today | New | Notes |
| --- | --- | --- |
| Sticky nav: title "NBA Senior Tuesday Box" / 🏠 + session date + status pill | Mantine `AppShell` header: club name + user menu. Session date/status move into the session card | Title: see Open questions |
| "Admin" pill, "Signed in as <first> · Sign out" (first name only on phones), "Sign in" | User menu (Mantine `Avatar` + `Menu`, as decided for S5 in V1): "Signed in as <first name>", Admin marker, **Light / Dark** (`SegmentedControl` with words, first visit follows the device), Sign out. Signed out: "Sign in" button | Avatar: initials (migrated accounts have no `user.image`) |
| Login modal ("Sign in with Google", error text after a failed return) | Same, Mantine `Modal` | `?error` handling and `signingIn` flag as in `app.js checkSignIn` |
| "Which player are you?" modal: search, pick, "This is me", can't be skipped (only Sign out); "New here? …" | Same rules, Mantine `Modal`; the list is a small `ListTable` with a "This is me" primary action (lab: "the person picker is the same table in a modal") | `justLinked` toast kept |
| Live banner (reconnecting / reload) | Same texts, Mantine `Alert` under the header | Agreed pattern (no per-cell indicators) |
| Toast (top right) | Mantine notifications (`toastOk`, `toastWithUndo`) | Lab open thread: toasts cover the pinned bar on phones. **Default: bottom-centre on phones**, top-centre on desktop |
| Loading overlay | Route pending states / skeletons | |
| During the port | "Back to the old version" link in the user menu (`/new/` only), and an admin-only "Try the new version" link in the old header | removed in U9 |

### Landing page: tabs Players · Sessions

Lab: `AppDemo` landing (Mantine `Tabs`). Routes `/new/players`, `/new/sessions` (old `#/players`, `#/sessions`). No Stats tab (decision 6).

**Players (ladder)** — lab `LadderDemo`; today `index.html` "Tab 1: Players".

| Today | New |
| --- | --- |
| Search, "N players" | ListTable search with count |
| Rank, name | `#`, Player (display names via `nameLabels`), **Nights**, **Last played** (new data) |
| HC ✅ / ❌ badge for everyone | **HelloClub** column and filter, for everyone ("it's not a secret") |
| — | Filter **Last played**, default 6 months (lapsed players appear under "Hidden by filters" when searched) |
| Admin: tap a row → player page | Admin primary action **View** → `/new/players/:id` (Enter views the top match) |
| Admin: ⬆ Import (CSV file + confirm; refused while a session is open) | Actions card: **Import ladder** (same: file picker + confirm modal, same refusal). The lab's import *page* is V16, later |
| ⬇ Export (everyone) | Actions card: **Export CSV** (everyone) |
| Empty: "No leaderboard data…" | ListTable empty state, same message |

Dropped from the lab: the "Ladder" filter (everyone listed is on the ladder; there are no off-ladder people until the member sync).

**Sessions** — lab `SessionsDemo`; today "Tab 2: Sessions".

| Today | New |
| --- | --- |
| List: "20 Oct 2026: 32 players", ✓ closed / ⏱ open, tap opens | Columns Date ("Tue 20 Oct", year once ~11 months back), Players, Status (Open / Closed); primary action **View** |
| — | Filter Date (`within`), default 6 months; **searchAlso "Played"**: search a player's name to find nights they played (needs player names per session; see Data) |
| New-session card: date picker (default next Tuesday, or the open session's date), "+ New Session" disabled for non-admins, disabled while the latest session isn't closed ("Close the current session first."), "Session already exists for this date." | Admin actions card: **New session** → modal with a date input (same default) and the same three rules, shown as text in the modal; creating opens the session's Check-in |

Dropped from the lab: the Night filter and column (one club night until V8).

### Player page (admin only) — `/new/players/:id`

No lab design; port today's page in Mantine (a card with label/value rows, like the session card's style).

- Fields: Name, Email, Preferred name ("Display name" in the UI, "Short name used in boxes (blank to use first name)"), HelloClub id (+ Linked badge), Sign-in ("Google: <email>" + **Unlink**, confirm).
- Actions card: **Edit** (inline form, Save / Cancel, Enter saves, Esc cancels), **Find in HelloClub** (modal: debounced search, results with #number and email, Select; if name/email differ, a confirm with "Update name" / "Update email" checkboxes), **Remove player** (red, confirm).
- Non-admins can't open it (redirect to the ladder), as today.

### Session page — `/new/sessions/:date/(checkin|boxes|results)`

Lab: `AppDemo` `SessionPage` (step 32: Corner layout, Light pills, labelled pills, locked steps without labels, pinned bar). Today: the Attendance / Games / Wrap-up tabs.

**The card** (ListTable `header`, one per step):

- Title line: session title (see Open questions) + pills **Date:**, **Status:** (Check-in open / Playing / Closed, coloured blue / teal / dark), and a count: **Coming: 15** → **Matches: 10/36** → **Players: 38**.
- Top right, admins: the way forward, green, confirmed: **Assign boxes ›** (check-in; disabled under 4 coming, reason shown) → **Close ›** (playing; disabled until every box is finished, reason shown) → nothing once closed.
- "…" (the one icon-only button, aria-label "More session actions"), admins, red items with confirms that say what they undo:
  - while playing: **Reassign boxes…** (confirm "clears all current scores", then the Assign modal with the current layout first) and **Re-open check-in…** (today's "Re-open Attendance"; counts boxes and scores in the warning; remembers the layout for the next Assign);
  - once closed: **Re-open session…** (today's "✏ Edit"; wording for "not the most recent session — the ladder won't be affected" kept);
  - always: **Delete session…** (today's header "🗑 Delete"; same warning). *(Not in the lab's final card; destructive, so "…" rather than a button.)*
- **Stepper** Check-in → Boxes → Results, navigation only; steps beyond the furthest reached are locked (lock icon, tap says "Boxes opens after Assign boxes"). Every step stays mounted (typed scores survive).
- **Pinned bar** (56px) once the card scrolls away: step name + status ("1 of 8 boxes finished") + the way forward; the table's search bar pins under it (`stickyTop`).
- **Step actions** (decision 5), word buttons in the card under the title line, everyone unless noted:
  - Check-in: **Print sign-in sheet**.
  - Boxes: **Print score sheets** (Menu: Cards / Grid).
  - Results: **Share on WhatsApp**; admins: **Sync to HelloClub**.
- "‹ Sessions" link above the card.
- **Players (non-admins):** the same card and steps, no way forward, no "…", no admin buttons.
- URL: today `#/<date>/attendance|games|wrapup`; new `/new/sessions/<date>/checkin|boxes|results`; opening `/new/sessions/<date>` goes to the furthest step reached.

**Check-in step** — lab `AttendanceDemo`; today "Tab 1: Attendance".

| Today | New |
| --- | --- |
| Ladder list (rank, name, ✓), search, tap toggles + clears search, ↑/↓/Enter/Esc | ListTable: `#`, Player, Last played (wide screens), HelloClub (wide screens); primary action **Mark coming ↔ Coming ✓**, Enter on the first match, search clears after, **Undo** toast (calls the API again) |
| Only admins can mark (API is admin-only); only while check-in is open | Same. Players and other states: no action column; a read-only **Coming ✓** column instead (V2 adds self check-in later) |
| "Attending: N" | Count pill "Coming: N" |
| "Games in progress — go to the Games tab to re-open attendance" | Not needed: the step is read-only while playing and "…" has Re-open check-in. A one-line note in the card says why marking is off |
| Admin, no match: "+ Add 'x' as new player" → Name + Insert at position (default bottom) → "Add & Mark Attending" | ListTable `addNew` "Add “x” as a new person" → lab's modal: **Full name**, **Display name** (→ `preferred_name`), **plus today's Ladder position** (default bottom). Only while check-in is open |
| Ladder used: `leaderboard` in check-in state, else `leaderboardBefore` | Same rule (keeps today's behaviour incl. the known import-while-open bug; AGENTS.md Known issues) |
| — | Filters: **Coming**, **Last played** (default 6 months), **HelloClub**. Lab's "Ladder" filter dropped (see above) |

**Assign boxes** (the lab only has a one-line confirm; today's modal is ported — decision: missing = mistake):

- Mantine `Modal` "Assign boxes": "Choose how to split N players into boxes", `Radio.Group` of options from `boxSizeOptions` ("2 boxes of 5, 1 box of 6 — 3 boxes total"), the **previous layout first** when there is one (current boxes on Reassign, or the layout cleared by Re-open check-in, in memory), a **Custom** option (editable textarea, one box per line, display names), the preview, and `parseBoxLayout` errors; **Assign** disabled while there are errors. On success: status Playing, Boxes step.
- Uses the shared rules in `worker/src/domain` (`boxes.ts`), not the browser bundle.

**Boxes step** — lab `GamesDemo` + `GamesDetail`; today "Tab 2: Games".

| Today | New |
| --- | --- |
| A card per box, header "Box 3 (5p): names", ✓/⏱, all expanded at first; Expand/Collapse all | ListTable row per box: Box, Players (bold match while searching), Matches "3/5", Status (wide screens); **Expand / Collapse** primary action; all **collapsed** at first (lab decision); Expand all next to Filters; Status filter |
| Search shows and expands matching boxes | Search narrows to the player's box; Enter expands it and focuses the first empty score; search kept |
| Per match: pair numbers, names (winner green), Set 1–3 inputs, third set only when split, status ✓ ⏱ ✗ | Lab match cards: "Match N" pill, status icon, pairs, **Game 1–3** lines, "Sitting out: …" pill; digits only, numeric keyboard, Enter/Next moves on; pair numbers dropped (lab decision) |
| Standings table (#, Player, Won, Games ±, Points ±) once any score | Lab Standings card |
| Inputs enabled by `canEnterScores`: admins any box, a linked player their own box, nobody once closed | **Same rule**, read-only fields otherwise |
| Live channel (`app.js _startLive` … `_mergeMatchSets`): 0.4s debounce, write ids, ack, a cell keeps what was typed until acked, reconnect with backoff, resend, 15s refresh while down, heartbeat, `changed` → reload, banner after 2s / 15s, refused write → reload banner | **Ported as one hook** (`useSessionLive`), same protocol and timings, same banner. `changed` invalidates the session query. Third-set clearing on a sweep sends the delete, as today |
| Re-open Attendance, Reassign, Print Cards/Grid in the toolbar | "…" (re-open, reassign) / step actions (print) |
| Close session on Wrap-up: disabled until all scores; confirm text depends on "most recent session"; closes, updates ladder, opens Wrap-up | **Close ›** in the card (decision 3); confirm adds "The ladder moves: N up, M down" (from `domain/close-preview.ts` / `ladder.ts`); then Results |

**Results step** — lab `SessionStatsDemo` in the session's card; today "Tab 3: Wrap-up".

| Today | New |
| --- | --- |
| "Post-game ranking": the whole ladder after, attendees with ↑n / ↓n / →, others greyed; search | ListTable of the players who played: Player, Box, Ranking Before / After / Change (`Delta`), sorted by After; filters Box and Ladder change (up / stayed / down / new). Only the ladder-movement part of the lab's Stats demo (no matches/games/points columns). From the session's ladders before/after and boxes; no API change |
| Placeholder while playing | Step locked until closed |
| 📱 Share on WhatsApp (closed): text with Results and Ladder links | **Share on WhatsApp**, same text, links to the new URLs after U9 (old links keep working via redirects) |
| 🔄 Sync HC (admin, closed) → log modal | **Sync to HelloClub** (admin, closed) → same log modal (Mantine) |

### Printing (U7)

"Printable score sheets stay as they are" (MIGRATION.md). Port the three print outputs to React with plain print CSS (no Tailwind), **visually identical**:

- **Sign-in sheet** (`printLadder`): A4 portrait popup, ladder before, colour-graded numbers, Attend / Signature columns.
- **Score sheets, Cards** and **Grid** (`index.html` `#print-area`, A4 landscape, one box per page, box-of-7 sitting-out cards, grid zoom 0.85, `cardHeightMm` 42).
- Check: print-media screenshots / PDFs of the same staging session from the old and new UI, compared side by side.

---

## Data and API additions

All additive; REST routes unchanged for the old UI.

- **Nights and Last played per player** (ladder, check-in). Measured on staging (a prod copy) 2026-10-24: `attendees ⨝ sessions` grouped by player reads **1,265 rows** per call (20 sessions, 613 attendee rows); it grows by roughly 1,500 rows a year. D1's free allowance is 5M rows read a day, so it's fine today, but an index can't make a full aggregate cheaper. **Plan:** cache it. Preferred: compute once per change of the latest closed session (Workers Cache API keyed by that session's id + `closed_at`, or a small table refreshed at close), so normal page loads read ~0 extra rows. Decide in U2; add a test that records `rows_read` for the new queries (D1 returns it in `meta`) so a regression shows up. (History: 2026-09-22 polling blew the 5M limit; migration 0010.)
- **Player names per session** (Sessions search "Played"): the same caching approach, or fetched only once the user starts searching. Measure in U2.
- **Results:** no API change (from `GET /api/sessions/:date` data).
- **Close preview:** no API change (`domain/close-preview.ts`).
- Server functions wrap the services extracted from `index.ts` (Architecture).

---

## Checks

- **Unit:** the lab's tests (filters, columns, activeRow, scoreSheet, shared) move with the code; services keep the API characterization tests green.
- **Browser (staging, `/new/`):** new Playwright scripts per step, modelled on the lab's `e2e/*.mjs` (app, filters, rapid-attendance, games, sessions, stats-table) but on real staging data; and the existing flows re-pointed at the new UI by U5: `admin-flow.mjs` (a whole night as Test Admin), `player-scores.mjs`, `fast-scores.mjs`, `live-offline.mjs`, `auth-ui.mjs`. Test Admin / Test Player accounts as today (`e2e/.env.staging`).
- **Old UI unchanged** until U9: `compare.mjs` and `compare-api.mjs` after every step.
- **Screenshots** at 390px and desktop, both colour schemes for the session card, kept out of git.
- **SSR:** no hydration warnings in the console (`shot.mjs` reports console errors).

---

## Steps in detail

**U1 — Start in the Worker, app shell at `/new/`.**
Spike first, with a fallback: Start's server entry dispatching to the live room, Hono and Start; old UI still served at `/`; `wrangler deploy` and Workers Builds (`deploy.sh`) still work; `.assetsignore` still keeps docs, `worker/`, `e2e/` private (check by fetching a few paths on staging). Then: Mantine provider + theme, notifications, modals; root route with `viewer` (from `/api/me` logic) and the "Which player are you?" gate; header + user menu + Light/Dark; Sign in / Sign out; "Back to the old version" link; admin-only "Try the new version" in the old header; placeholder landing. Decide the ListTable SSR approach (render list routes client-only, or SSR with a phone-first default). Checks: auth-ui flows on `/new/`, compare + compare-api, no console errors. Rollback: revert the PR (no data changes).

**U2 — ListTable + landing page.** Copy `src/lab/*` + tests; Ladder tab (Nights/Last played with caching and a rows-read test; HelloClub filter; View for admins; Import / Export CSV); Sessions tab (Date filter, "Played" search, View, New session modal). Extract the services these need.

**U3 — Player page.** Profile view/edit, Find in HelloClub + confirm, Unlink, Remove. (HelloClub search is a read; no HelloClub writes here.)

**U4 — Session page frame + Check-in + Assign boxes.** Card, pills, stepper, pinned bar, "…" (Re-open check-in, Delete), routes; Check-in table, Undo, add person (with ladder position); Assign boxes modal (options, previous layout, custom); Print sign-in sheet button (wired to the old print code path until U7 if needed).

**U5 — Boxes step.** Box table + match cards + standings; `canEnterScores`; `useSessionLive` (port of `_startLive` and friends, same timings) + banner; Reassign; Close (disabled until finished; confirm with ladder summary; most-recent wording); Re-open session. Re-point `admin-flow`, `player-scores`, `fast-scores`, `live-offline` at `/new/` (keep the old-UI versions until U9).

**U6 — Results step.** Ladder-movement table from session data; Share on WhatsApp; Sync to HelloClub + log modal (prod-only effect; never run sync on staging: its HelloClub key is fake).

**U7 — Printing.** As above, with the old/new comparison.

**U8 — Legibility and polish.** Apply the 12px / gray-7 rule everywhere (lab `DECISIONS.md` "Session pages, legibility" lists the places); toast placement; keyboard and screen-reader pass; phone pass on every screen; dark mode pass.

**U9 — Cutover.** Router basepath `/`; client-side redirects for every old hash route (`#/players`, `#/sessions`, `#/players/:id`, `#/<date>/(attendance|games|wrapup)`, and the older `#/session/<date>/…`); remove `index.html`, `js/`, `worker/src/browser`, `build:web`, the old-UI links; e2e scripts switched for good; AGENTS.md "Frontend" rewritten; MIGRATION.md S5 ✅, V13 ✅, V14 ✅. **Before merging:** the developer runs a real session night on `/new/`.

---

## Open questions (for the developer; the choice made meanwhile is in bold)

Answered 2026-10-24: no Stats tab (only the ladder-movement table, as Results); titles "Northland Badminton" / "Tuesday Box"; HelloClub column and filter for everyone; Results lists only players who played; session URLs keyed by date; Reassign in "…".

(none open)

---

## Log

- **2026-10-24 (U0):** plan written with the developer. Read: `index.html`, `js/app.js`, `js/storage.js`; the lab's demos, `HANDOFF.md`, `DECISIONS.md`, `REQUIREMENTS.md`, step 32 screenshots; club-next's Start setup (`src/server.ts`, `vite.config.ts`, `src/routes/__root.tsx`, `src/router.tsx`). The lab's `HANDOFF.md` says step 31 but its gallery says step 32 ("session page settled; its experiments removed": Tabs/Wizard variants gone, Corner + labelled pills kept). Lab domain = club domain. Nights/Last-played query measured on staging: 1,265 rows read.
- **2026-10-24 (U1):** done; staging deployed and checked (compare-api: 24/24 identical; compare: old UI pages identical; auth-ui, admin-flow, player-scores, live-offline, fast-scores all pass through the new entry). How it's wired, for later steps:
  - `worker/src/server.ts` is the Worker `main`: `/api/*` → Hono (`src/index.ts`, still `export default app`), else → Start. Static files (old UI) are served before the Worker.
  - Vite base stays `/`; the router basepath is set explicitly (`tanstackStart({ router: { basepath: '/new' } })`) and client files go to `build.assetsDir: 'new/assets'`. (With `base: '/new/'` the files landed in `/assets/` while the HTML pointed at `/new/assets/`.) Start redirects unknown paths to `/new/…`. **U9:** drop the basepath and assetsDir.
  - Old UI files are copied into `worker/.legacy` (`scripts/copy-legacy.mjs`) = Vite's `publicDir`. So only built files are public now.
  - `vite.config.mts` (not `.ts`: the package isn't `type: module`). `--mode staging` sets `CLOUDFLARE_ENV=staging`; checked with `wrangler deploy --dry-run`: staging → `club-api-staging` + `club-staging`, prod → `club` + `club-prod`, DO migration kept.
  - Types: one `tsconfig.json` with DOM + `worker-configuration.d.ts` (`npm run types`); `@cloudflare/workers-types` removed. `@cloudflare/vite-plugin` 1.65.0 matches wrangler 4.152.0 (one wrangler). `@tanstack/react-query` 5.104.5 to match `react-router-ssr-query`'s query-core (two copies broke types).
  - Services pattern: `src/services/context.ts` (`ServiceContext` = env + db + headers, `CLUB_ID`, `signedIn`), services throw `ServiceError(message, status)`; Hono routes use `run(c, fn)`; server functions build the context with `requestContext()` (`src/app/server/request.ts`, `env` from `cloudflare:workers`, `getRequestHeaders()`).
  - **Informative grey:** `c={INFO_TEXT}` (`lib/colors.ts`, CSS var in `styles.css`), never `c="gray.7"`: gray-7 is unreadable in dark mode. Replace it in lab code when copying.
  - Notifications: bottom-centre on phones, top-centre on desktop (closes the lab's toast-over-pinned-bar thread).
  - Screenshots go to the session scratchpad, not `$TMP` (in Git Bash that's the system temp).
- **2026-10-24 (U2):** done; on staging; compare-api identical, admin-flow passes (create session / import now go through `services/`).
  - ListTable copied verbatim into `src/app/components/list-table/` (+ its tests); one change: the exported `ListTable` renders client-only (`ClientOnly`, a skeleton meanwhile) because it calls `window.matchMedia` while rendering. Data still comes with the page (route loaders).
  - Lab `demos/shared.tsx` → `components/list-helpers.tsx` (`playedDate`, `sessionDate`, `nameLabels`, `PersonRow`, filters); names → `lib/names.ts`: short name = `preferred_name`, else the first name (old UI's `firstName`), full name on a clash in the view.
  - **Nights / Last played** count closed sessions only. Cached per isolate by `db.closedSessionsVersion` (count, max `closed_at`, sum of ids of closed sessions) in `services/cache.ts`; the Cache API does nothing on workers.dev. A test counts statements to prove the aggregate runs once until a session closes / re-opens. Known staleness: a renamed player's old name stays in the Sessions "Played" search until the next close (acceptable).
  - Sessions "Played" search: closed sessions' attendees cached the same way, open sessions' read live.
  - Ladder import is refused in the new UI while the latest session isn't closed (the old UI checked only the session it had open).
  - In e2e scripts the ListTable search box is `[role=combobox]`.
- **2026-10-24 (U3):** done; on staging. Player routes and the HelloClub member search moved into `services/players.ts` (API tests green). New browser-check helper `e2e/new-ui-lib.mjs` (`open({ as, phone })`, `check`, `done`) and `e2e/new-player-page.mjs`. Page actions card for pages without a table: `components/PageCard.tsx` (same tint as ListTable's).
