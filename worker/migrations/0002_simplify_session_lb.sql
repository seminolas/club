-- Replaces session_lb with session_ranks; removes players.current_rank.
--
-- New semantics for session_ranks.session_id:
--   NULL          = founding/seed leaderboard (immutable after import)
--   N (open)      = working "before" state for session N (mutable until close)
--   N (closed)    = final "after" state for session N (immutable)

CREATE TABLE session_ranks (
  session_id    INTEGER REFERENCES sessions(id),
  player_id     INTEGER NOT NULL REFERENCES players(id),
  rank_position INTEGER NOT NULL,
  PRIMARY KEY (session_id, player_id)
);

-- Seed: the 'before' snapshot of the earliest session = founding leaderboard
INSERT INTO session_ranks (session_id, player_id, rank_position)
SELECT NULL, player_id, rank_position FROM session_lb
WHERE snapshot = 'before'
  AND session_id = (SELECT id FROM sessions ORDER BY date ASC LIMIT 1);

-- Post-session state: all 'after' snapshots carry over directly
INSERT INTO session_ranks (session_id, player_id, rank_position)
SELECT session_id, player_id, rank_position FROM session_lb
WHERE snapshot = 'after';

-- 'before' rows for sessions 2+ are redundant (= prior session's 'after'); discard.

DROP TABLE session_lb;

ALTER TABLE players DROP COLUMN current_rank;
