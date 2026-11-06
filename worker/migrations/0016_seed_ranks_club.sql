-- V8 step 2 (MULTI-CLUB.md, option C): people are shared across clubs, so a
-- club's starting ladder (the ranks before its first session, session_id
-- NULL) can't be told apart by its players' club any more. Each such row
-- names its club. Rows of a session leave it NULL: their session has a club.
ALTER TABLE session_ranks ADD COLUMN club_id INTEGER REFERENCES clubs(id);
UPDATE session_ranks
SET club_id = (SELECT p.club_id FROM players p WHERE p.id = session_ranks.player_id)
WHERE session_id IS NULL;
