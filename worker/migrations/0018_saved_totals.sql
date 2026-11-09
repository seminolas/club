-- Saved results of the reads over all of a club's closed sessions (nights
-- played, the session list and who attended), keyed by the same version as
-- the in-memory cache (services/cache.ts, savedByVersion). A Worker that
-- starts cold then reads one row instead of every attendee row again: these
-- were about a third of prod's D1 reads (week to 2026-11-09). A row whose
-- version is out of date is recomputed and overwritten on the next read.
CREATE TABLE saved_totals (
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (club_id, name)
);

-- Signing in matches the login's email against players' HelloClub emails,
-- ignoring case and outer spaces (db.ts, autoLinkByEmail): without this
-- index every page view of a signed-in, unlinked user read every player.
CREATE INDEX players_email_key ON players(lower(trim(email)));
