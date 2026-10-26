# Multiple clubs and nights: thinking so far

> **Status: ideas, nothing decided** (developer, 2026-10-27). Notes from a conversation, kept so the reasoning isn't lost. Other options are still being discussed. Related: MIGRATION.md V8 ("Multiple clubs"); club-next's `decisions.md` ("Domain model", "Sessions", "Rankings", 2026-10-01).

## The situation

- Northland Badminton runs two clubs: **juniors** and **seniors**. The same admins run everything.
- **Juniors:** two nights a week, but only one (Thursday) runs box sessions.
- **Seniors:** one weekly session (Tuesday) today; a second night (e.g. Friday) is planned.
- Some juniors also play in the seniors boxes. With two seniors nights, some players will come to one night only (a preferred night), some to both.
- The worry is the **ladder**, not admin access.

## The ladder problem with a second, smaller night

Under 2-up-2-down, the players who came swap the ladder slots they held between them; absent players keep theirs. On a full night those slots are adjacent, so a box winner moves a few places. On a thin night the same rule swaps widely spaced slots (#40 can take #22's place in one night) without beating anyone in between. A small second night doesn't advantage anyone on average, but it makes movement large and noisy and disturbs the main night's boxes. People who come both nights also move twice as often.

Options considered for a second night:

1. **One ladder, both nights move it.** Simplest; has exactly the problem above when the second night is much smaller.
2. **One ladder; the second night uses it for boxes but doesn't move it** (results count for stats/OpenSkill only).
3. **A ladder per night**, the second seeded from the first's order. People who play both nights hold two positions (as juniors who play seniors do).
4. **One ladder with a damped rule for thin nights** (e.g. a cap on movement per session). New rules to design and explain.

**Leaning: a ladder per night** (developer, 2026-10-25: "probably ladder per night for now").

## Ways to build it

### Separate apps per night (three Workers)

Same code, three wrangler environments (Tuesday, Friday, juniors), each its own Worker, D1 and Durable Object, with a link-button switcher between them. No schema change, complete isolation. But: sign-in and "Which player are you?" three times (workers.dev sites can't share a login), every deploy, migration, backup and staging setup ×3, a person is three unrelated records (edits drift, nothing across nights possible: combined player page, one OpenSkill rating), and merging later is the expensive direction. Free-plan limits are per account, so three apps share one allowance (usage is small).

### One app, a "club" per night, a player record per club

The schema already has `clubs` and `club_id` (hard-coded to 1). Each night as a club gives the same separation in one Worker, one database, one deploy. But a person is still a record per club, and one login can only link to one player record today (unique `players.user_id`), so two-nights players would need several links.

### One app, people organisation-wide, a ladder per night (**possibly acceptable**, 2026-10-27)

The model the developer described, and club-next's:

- **One record per person**: one login, one HelloClub link, one display name. Everyone is effectively "in" every club; there's no membership to manage.
- **Each club night has its own ladder.** Being on a night's ladder is what makes someone part of it.
- **What's visible follows from the data:** a night's ladder shows people with a position on it; sessions and results show who attended; check-in search finds anyone in the organisation (under "Hidden by filters" if they're not on this night's ladder) and marking them coming gives them a position there; one player page per person shows their position and results on each night they play.

Distance from today's schema: ladders are already per club in practice (a ladder is the positions stored with each session, `session_ranks`, and sessions have a `club_id`). The main change is making people organisation-wide (stop filtering `players` by `club_id`). Rules that need adjusting:

- **Ladder import** archives anyone missing from the imported list: with shared people it should only take them off that night's ladder.
- **Remove player** per night means "take off this ladder"; archiving a person stays an admin action on their page.
- **Nights / Last played** become per ladder (a filter on sessions).
- **Adding a new person** at check-in creates them once; other nights find them by search.
- Per-night settings (title, the HelloClub event the sync looks for, which today is hard-coded as `'Senior Box'`) go in `clubs.config`.
- Session URLs need the club/night (or session ids): two clubs can play on the same date.

## UI ideas (with a ladder per night)

- **Switcher at the top** between the club nights (word-labelled link buttons or a menu, the current one highlighted), with the night in the URL (`/tuesday/…` or similar).
- Alternative considered: a **club** switcher only, with nights handled per page: a combined Sessions list with a Night column and filter (built in club-table-lab), a **Tuesday | Friday** picker on the Ladder tab (not a filter: each ladder is a different ordering of the same people), and the night in the session page's title.
- **Player page:** a "Ladders" section listing each position (Seniors · Tuesday #12, Seniors · Friday #4, Juniors · Thursday #2).
- **Newcomer to a night's ladder:** placed at their relative position from their usual night (just below the nearest player who is above them there), or at the bottom. Undo toast says where they went.

## Open questions

- How big will the second seniors night be compared with Tuesday?
- Should second-night results count for something, or is it a social night with sensible boxes?
- Seniors showing up in juniors check-in search (not on its ladder or results unless they play): acceptable?
- Where does someone start on a night's ladder they haven't played: relative position or the bottom?
- URL wording: `/tuesday/…`, `/seniors/friday/…`, or ids?
