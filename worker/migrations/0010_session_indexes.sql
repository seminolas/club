-- Secondary indexes for the per-session reads behind GET /sessions/:date (polled
-- every 3s by open session views). Without them, filtering boxes by session_id and
-- matches by box_id full-scans match_sets/box_players on every poll, which pushed
-- prod past D1's free-tier 5M rows-read/day limit on 2026-09-22.

CREATE INDEX IF NOT EXISTS boxes_session ON boxes(session_id, box_number);
CREATE INDEX IF NOT EXISTS matches_box ON matches(box_id, match_number);
CREATE INDEX IF NOT EXISTS session_ranks_session_phase ON session_ranks(session_id, phase, rank_position);
