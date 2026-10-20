-- One-off (S0, 2026-10-21): mark the migrations that were applied by hand with
-- `wrangler d1 execute --file` as applied, so `wrangler d1 migrations apply`
-- only runs new files from 0011 on. Only 0001 was tracked before this.
-- Verified against prod's schema first: every change in 0002–0010 is present.
-- Rollback: DELETE FROM d1_migrations WHERE name > '0001_schema.sql';

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0001_schema.sql'),
  ('0002_rename_status.sql'),
  ('0002_simplify_session_lb.sql'),
  ('0003_player_email.sql'),
  ('0004_match_players.sql'),
  ('0005_preferred_name.sql'),
  ('0006_auth_profiles.sql'),
  ('0007_roles.sql'),
  ('0008_drop_club_admins.sql'),
  ('0009_session_ranks_phase.sql'),
  ('0010_session_indexes.sql');
