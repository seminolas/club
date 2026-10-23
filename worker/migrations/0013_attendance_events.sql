-- Check-in audit (S3a): every change to who's coming to a session, with who
-- made it and when. Append-only; `attendees` stays the current state.
-- by_player_id is the person who made the change (not their login), so the
-- record survives a login being moved or unlinked.

CREATE TABLE attendance_events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  attending INTEGER NOT NULL,
  by_player_id INTEGER REFERENCES players(id),
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX attendance_events_session ON attendance_events(session_id, player_id, at);
