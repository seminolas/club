# CLAUDE.md

This is the **live** Northland Badminton Club app — real production software used every session night. Read these before doing anything:

1. **`AGENTS.md`** — how the app works today (deployment, schema, routes, business logic, gotchas).
2. **`MIGRATION.md`** — the agreed plan for gradually converting this app to the new architecture, step by step, with the current status. It also says how to work: plan each step first and get approval, staging before prod, back up before schema changes.

The design thinking and the reference implementation for the migration live in `C:/dev/src/club-next` (read-only reference — don't develop features there anymore).

## Working preferences (from the developer)

- **Discuss before implementing.** For any new feature or UI element, even a small one, first give a short proposal: what, where, which existing library or pattern, options and a recommendation. Wait for the go-ahead before building. Bug fixes and already-agreed changes don't need this.
- **Prefer off-the-shelf.** Use Mantine built-ins, ui.mantine.dev patterns or established libraries before writing custom logic, and say why if nothing existing fits. Keep user-facing choices to ones most people understand (e.g. Light/Dark, not extra modes), with self-explanatory labels (words, not an icon alone).
