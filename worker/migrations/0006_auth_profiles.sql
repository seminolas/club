CREATE TABLE player_auth_profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  provider    TEXT NOT NULL,   -- 'google', 'facebook', etc.
  provider_id TEXT NOT NULL,   -- stable ID from the identity provider
  email       TEXT,            -- provider email at time of HC linking
  UNIQUE(provider, provider_id)
);
