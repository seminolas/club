CREATE TABLE match_players (
  match_id  INTEGER NOT NULL REFERENCES matches(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  side      INTEGER NOT NULL,  -- 0 = pair A, 1 = pair B
  PRIMARY KEY (match_id, player_id)
);

-- Backfill existing matches by deriving sides from box_players.position + PAIRINGS lookup.
INSERT INTO match_players (match_id, player_id, side)
SELECT match_id, player_id, side FROM (
  SELECT
    m.id AS match_id,
    bp.player_id,
    CASE
      -- 4-player box
      WHEN bs.box_size = 4 AND m.match_number = 0 AND bp.position IN (0, 1) THEN 0
      WHEN bs.box_size = 4 AND m.match_number = 0 AND bp.position IN (2, 3) THEN 1
      WHEN bs.box_size = 4 AND m.match_number = 1 AND bp.position IN (0, 2) THEN 0
      WHEN bs.box_size = 4 AND m.match_number = 1 AND bp.position IN (1, 3) THEN 1
      WHEN bs.box_size = 4 AND m.match_number = 2 AND bp.position IN (0, 3) THEN 0
      WHEN bs.box_size = 4 AND m.match_number = 2 AND bp.position IN (1, 2) THEN 1
      -- 5-player box
      WHEN bs.box_size = 5 AND m.match_number = 0 AND bp.position IN (0, 1) THEN 0
      WHEN bs.box_size = 5 AND m.match_number = 0 AND bp.position IN (2, 4) THEN 1
      WHEN bs.box_size = 5 AND m.match_number = 1 AND bp.position IN (2, 3) THEN 0
      WHEN bs.box_size = 5 AND m.match_number = 1 AND bp.position IN (1, 4) THEN 1
      WHEN bs.box_size = 5 AND m.match_number = 2 AND bp.position IN (0, 2) THEN 0
      WHEN bs.box_size = 5 AND m.match_number = 2 AND bp.position IN (3, 4) THEN 1
      WHEN bs.box_size = 5 AND m.match_number = 3 AND bp.position IN (0, 3) THEN 0
      WHEN bs.box_size = 5 AND m.match_number = 3 AND bp.position IN (1, 2) THEN 1
      WHEN bs.box_size = 5 AND m.match_number = 4 AND bp.position IN (0, 4) THEN 0
      WHEN bs.box_size = 5 AND m.match_number = 4 AND bp.position IN (1, 3) THEN 1
    END AS side
  FROM matches m
  JOIN boxes b ON b.id = m.box_id
  JOIN box_players bp ON bp.box_id = b.id
  JOIN (
    SELECT box_id, COUNT(*) AS box_size FROM box_players GROUP BY box_id
  ) bs ON bs.box_id = b.id
)
WHERE side IS NOT NULL;
