-- Adds a 'phase' column (before|after) to session_ranks so that both snapshots
-- coexist for each session, instead of relying on the previous session's rows for
-- the 'before' state. This fixes mid-session player additions (e.g. a new player
-- inserted at rank N): their insertion position was previously destroyed when close
-- overwrote the session's rows with the after-state.
--
-- Migration strategy:
--   1. Recreate table with phase column and updated unique constraint.
--   2. Tag existing rows: closed sessions → 'after', open sessions → 'before',
--      seed rows (session_id IS NULL) → 'after'.
--   3. Insert 'before' rows for closed sessions from the previous session's
--      'after' rows (same logic as the GET handler currently uses at read-time).
--   4. For players who appear in a closed session's 'after' but have no 'before'
--      row (mid-session additions like Chloe): use their after-rank as a
--      best-effort before-rank. The true insertion rank was overwritten by close;
--      this is the closest approximation available.

CREATE TABLE session_ranks_new (
  session_id    INTEGER REFERENCES sessions(id),
  player_id     INTEGER NOT NULL REFERENCES players(id),
  rank_position INTEGER NOT NULL,
  phase         TEXT NOT NULL DEFAULT 'after',
  UNIQUE(session_id, player_id, phase)
);

-- Step 1: Copy existing rows, tagging phase appropriately.
INSERT INTO session_ranks_new (session_id, player_id, rank_position, phase)
SELECT
  sr.session_id,
  sr.player_id,
  sr.rank_position,
  CASE
    WHEN sr.session_id IS NULL THEN 'after'
    WHEN s.status = 'closed'  THEN 'after'
    ELSE 'before'
  END
FROM session_ranks sr
LEFT JOIN sessions s ON s.id = sr.session_id;

-- Step 2: Insert 'before' rows for closed sessions from the previous session's
-- 'after' rows.
INSERT INTO session_ranks_new (session_id, player_id, rank_position, phase)
SELECT
  curr.id,
  prev_sr.player_id,
  prev_sr.rank_position,
  'before'
FROM sessions curr
JOIN sessions prev ON prev.id = (
  SELECT id FROM sessions
  WHERE date < curr.date AND club_id = curr.club_id
  ORDER BY date DESC LIMIT 1
)
JOIN session_ranks_new prev_sr
  ON prev_sr.session_id = prev.id AND prev_sr.phase = 'after'
WHERE curr.status = 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM session_ranks_new x
    WHERE x.session_id = curr.id
      AND x.player_id  = prev_sr.player_id
      AND x.phase      = 'before'
  );

-- Step 3: Players in a closed session's 'after' with no 'before' row are mid-session
-- additions whose insertion rank was lost at close. Use after-rank as approximation.
INSERT INTO session_ranks_new (session_id, player_id, rank_position, phase)
SELECT
  curr_sr.session_id,
  curr_sr.player_id,
  curr_sr.rank_position,
  'before'
FROM session_ranks_new curr_sr
JOIN sessions s ON s.id = curr_sr.session_id
WHERE curr_sr.phase = 'after'
  AND s.status = 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM session_ranks_new x
    WHERE x.session_id = curr_sr.session_id
      AND x.player_id  = curr_sr.player_id
      AND x.phase      = 'before'
  );

DROP TABLE session_ranks;
ALTER TABLE session_ranks_new RENAME TO session_ranks;
