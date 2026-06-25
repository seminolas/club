// One-time script: reads JSON from temp-badminton repo and generates dump.sql
// Run: node scripts/gen-dump.js
// Then: npx wrangler d1 execute club-prod --file scripts/dump.sql --remote
const fs = require('fs');
const path = require('path');

const OLD = path.join(__dirname, '../../../temp-badminton/data');
const leaderboard  = JSON.parse(fs.readFileSync(path.join(OLD, 'leaderboard.json'), 'utf8'));
const hcMembers    = JSON.parse(fs.readFileSync(path.join(OLD, 'helloclub-members.json'), 'utf8'));
const session09    = JSON.parse(fs.readFileSync(path.join(OLD, 'sessions/2026-06-09.json'), 'utf8'));
const session16    = JSON.parse(fs.readFileSync(path.join(OLD, 'sessions/2026-06-16.json'), 'utf8'));
const session23    = JSON.parse(fs.readFileSync(path.join(OLD, 'sessions/2026-06-23.json'), 'utf8'));

const hcMap = {};
for (const m of hcMembers) {
  for (const n of m.names) hcMap[n] = m.id;
}

const esc = s => s.replace(/'/g, "''");
const lines = [];
const emit = s => lines.push(s);

// ── Players ─────────────────────────────────────────────────────────────────
// Use 2026-06-23 leaderboardBefore = correct post-June-16 rankings
const currentRanking = session23.leaderboardBefore;
for (let i = 0; i < currentRanking.length; i++) {
  const name = currentRanking[i];
  const hcId = hcMap[name];
  const hcVal = hcId ? `'${hcId}'` : 'NULL';
  emit(`INSERT INTO players (club_id, name, current_rank, hc_member_id) VALUES (1, '${esc(name)}', ${i + 1}, ${hcVal});`);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
for (const s of [session09, session16, session23]) {
  const closedAt = s.status === 'closed' ? `'${s.date}T23:59:59Z'` : 'NULL';
  emit(`INSERT INTO sessions (club_id, date, status, created_at, closed_at) VALUES (1, '${s.date}', '${s.status}', '${s.date}T00:00:00Z', ${closedAt});`);
}

// ── Session leaderboard snapshots ─────────────────────────────────────────────
function insertLb(date, ranking, snapshot) {
  for (let i = 0; i < ranking.length; i++) {
    const name = ranking[i];
    // Subquery returns empty if player not in players table → safe to INSERT directly
    emit(`INSERT OR IGNORE INTO session_lb (session_id, player_id, rank_position, snapshot) SELECT s.id, p.id, ${i + 1}, '${snapshot}' FROM sessions s, players p WHERE s.club_id=1 AND s.date='${date}' AND p.club_id=1 AND p.name='${esc(name)}';`);
  }
}
for (const s of [session09, session16, session23]) {
  insertLb(s.date, s.leaderboardBefore, 'before');
  if (s.leaderboardAfter) insertLb(s.date, s.leaderboardAfter, 'after');
}

// ── Attendees ─────────────────────────────────────────────────────────────────
for (const s of [session09, session16, session23]) {
  for (const name of s.attendees) {
    emit(`INSERT OR IGNORE INTO attendees (session_id, player_id) SELECT s.id, p.id FROM sessions s, players p WHERE s.club_id=1 AND s.date='${s.date}' AND p.club_id=1 AND p.name='${esc(name)}';`);
  }
}

// ── Boxes, box_players, matches, match_sets ────────────────────────────────────
for (const s of [session09, session16, session23]) {
  for (let bi = 0; bi < s.boxes.length; bi++) {
    const box = s.boxes[bi];
    emit(`INSERT INTO boxes (session_id, box_number) SELECT id, ${bi} FROM sessions WHERE club_id=1 AND date='${s.date}';`);

    for (let pi = 0; pi < box.players.length; pi++) {
      const name = box.players[pi];
      emit(`INSERT OR IGNORE INTO box_players (box_id, player_id, position) SELECT b.id, p.id, ${pi} FROM boxes b JOIN sessions s ON s.id=b.session_id, players p WHERE s.club_id=1 AND s.date='${s.date}' AND b.box_number=${bi} AND p.club_id=1 AND p.name='${esc(name)}';`);
    }

    for (let mi = 0; mi < box.matches.length; mi++) {
      const match = box.matches[mi];
      emit(`INSERT INTO matches (box_id, match_number) SELECT b.id, ${mi} FROM boxes b JOIN sessions s ON s.id=b.session_id WHERE s.club_id=1 AND s.date='${s.date}' AND b.box_number=${bi};`);

      for (let si = 0; si < match.sets.length; si++) {
        const [scoreA, scoreB] = match.sets[si];
        emit(`INSERT INTO match_sets (match_id, set_number, score_a, score_b) SELECT m.id, ${si}, ${scoreA}, ${scoreB} FROM matches m JOIN boxes b ON b.id=m.box_id JOIN sessions s ON s.id=b.session_id WHERE s.club_id=1 AND s.date='${s.date}' AND b.box_number=${bi} AND m.match_number=${mi};`);
      }
    }
  }
}

const out = path.join(__dirname, 'dump.sql');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Generated ${lines.length} statements → ${out}`);
