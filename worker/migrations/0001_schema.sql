CREATE TABLE clubs (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  config     TEXT NOT NULL  -- JSON: { timezone, hcSubdomain, hcClubId, minBoxSize, maxBoxSize, setsPerMatch }
);

CREATE TABLE players (
  id           INTEGER PRIMARY KEY,
  club_id      INTEGER NOT NULL REFERENCES clubs(id),
  name         TEXT NOT NULL,
  current_rank INTEGER NOT NULL,
  hc_member_id TEXT,
  archived_at  TEXT
);

CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  club_id    INTEGER NOT NULL REFERENCES clubs(id),
  date       TEXT NOT NULL,
  status     TEXT NOT NULL,  -- 'attendance' | 'boxes_assigned' | 'in_progress' | 'closed'
  created_at TEXT NOT NULL,
  closed_at  TEXT
);

CREATE UNIQUE INDEX sessions_club_date ON sessions(club_id, date);

CREATE TABLE session_lb (
  session_id    INTEGER NOT NULL REFERENCES sessions(id),
  player_id     INTEGER NOT NULL REFERENCES players(id),
  rank_position INTEGER NOT NULL,
  snapshot      TEXT NOT NULL,  -- 'before' | 'after'
  PRIMARY KEY (session_id, player_id, snapshot)
);

CREATE TABLE attendees (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (session_id, player_id)
);

CREATE TABLE boxes (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  box_number INTEGER NOT NULL
);

CREATE TABLE box_players (
  box_id     INTEGER NOT NULL REFERENCES boxes(id),
  player_id  INTEGER NOT NULL REFERENCES players(id),
  position   INTEGER NOT NULL,  -- 0-indexed; determines pairing per PAIRINGS_4/PAIRINGS_5
  PRIMARY KEY (box_id, player_id)
);

CREATE TABLE matches (
  id           INTEGER PRIMARY KEY,
  box_id       INTEGER NOT NULL REFERENCES boxes(id),
  match_number INTEGER NOT NULL
);

CREATE TABLE match_sets (
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  set_number INTEGER NOT NULL,
  score_a    INTEGER,
  score_b    INTEGER,
  PRIMARY KEY (match_id, set_number)
);

CREATE TABLE club_admins (
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  email   TEXT NOT NULL,
  role    TEXT NOT NULL,  -- 'owner' | 'admin'
  PRIMARY KEY (club_id, email)
);
