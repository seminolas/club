-- Skill (a statistical estimate of each player's strength from their game
-- scores; domain/skill.ts), saved per closed session like the ladder after
-- it: the skill of everyone with a game in the club's closed sessions up to
-- and including this one. The current skill is the latest closed session's.
-- Deleted with the session; re-opening a session deletes its snapshot.

CREATE TABLE session_skill (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  strength REAL NOT NULL,
  rank INTEGER NOT NULL,
  games INTEGER NOT NULL,
  PRIMARY KEY (session_id, player_id)
);
