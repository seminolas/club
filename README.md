# Northland Badminton Club — Session Manager

Web app for running Tuesday night Senior Box Badminton sessions:
attendance tracking, box assignment, score entry, leaderboard management,
and HelloClub attendance sync.

**Production:** https://club.vilhelmas-f78.workers.dev/  
**Repo:** https://github.com/seminolas/club

## Stack

- **Frontend:** Alpine.js + Tailwind CDN, plain HTML/JS (no build step)
- **Backend:** Cloudflare Workers (Hono), TypeScript
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** Google Identity Services (GIS), JWT signed with `JWT_SECRET`
- **External:** HelloClub API for member sync

## Deploying

```bash
cd worker
npx wrangler deploy                    # prod
npx wrangler deploy --env staging      # staging
```

**Do not deploy to staging with a real HC API key** — the staging HC key is intentionally nonsense to prevent accidental sync.

## DB migrations

```bash
# Apply a new migration to prod
npx wrangler d1 execute club-prod --remote --file=migrations/XXXX_name.sql

# Staging
npx wrangler d1 execute club-staging --remote --file=migrations/XXXX_name.sql
```

Migrations live in `worker/migrations/`. They are applied manually — wrangler does not auto-run them on deploy.

## Secrets (set via Cloudflare dashboard or `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `JWT_SECRET` | Signs session JWTs |
| `HC_API_KEY` | HelloClub API key (prod only; staging key is nonsense) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for GIS |

`HC_CLUB_ID` and `HC_CLUB_SLUG` are plain vars in `wrangler.toml`.

## Analytics dashboards

`stats.html` and `stats2.html` at the repo root are standalone analytics pages
(Observable Plot + Grid.js) served as static assets. They fetch live data from
the `/api/sessions` and `/api/leaderboard` endpoints.
