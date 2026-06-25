// D1 query helpers — all queries parameterised, no string interpolation.

import type { Box, Match, SessionStatus } from './types';

// ── Leaderboard / session_ranks ───────────────────────────────────────────────

// Returns players ordered by their rank in the most recent session (or seed if none).
export async function getLeaderboardPlayers(
  db: D1Database, clubId: number
): Promise<{ id: number; name: string }[]> {
  const { results } = await db
    .prepare(`
      SELECT p.id, p.name FROM players p
      JOIN session_ranks sr ON sr.player_id = p.id
      WHERE p.club_id = ? AND p.archived_at IS NULL
        AND sr.session_id IS (SELECT id FROM sessions WHERE club_id = ? ORDER BY date DESC LIMIT 1)
      ORDER BY sr.rank_position
    `)
    .bind(clubId, clubId)
    .all<{ id: number; name: string }>();
  return results;
}

export async function getPlayerByName(
  db: D1Database, clubId: number, name: string
): Promise<{ id: number; name: string } | null> {
  return db
    .prepare('SELECT id, name FROM players WHERE club_id = ? AND name = ? AND archived_at IS NULL')
    .bind(clubId, name)
    .first<{ id: number; name: string }>();
}

// Get ranked player names for a given session_id (NULL = seed).
export async function getSessionRanks(
  db: D1Database, sessionId: number | null
): Promise<string[]> {
  const { results } = sessionId === null
    ? await db
        .prepare(`
          SELECT p.name FROM session_ranks sr
          JOIN players p ON p.id = sr.player_id
          WHERE sr.session_id IS NULL
          ORDER BY sr.rank_position
        `)
        .all<{ name: string }>()
    : await db
        .prepare(`
          SELECT p.name FROM session_ranks sr
          JOIN players p ON p.id = sr.player_id
          WHERE sr.session_id = ?
          ORDER BY sr.rank_position
        `)
        .bind(sessionId)
        .all<{ name: string }>();
  return results.map(r => r.name);
}

// Returns the id of the session immediately before the given one, or null if first.
export async function getPrevSessionId(
  db: D1Database, sessionId: number
): Promise<number | null> {
  const row = await db
    .prepare('SELECT id FROM sessions WHERE date < (SELECT date FROM sessions WHERE id = ?) ORDER BY date DESC LIMIT 1')
    .bind(sessionId)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// Replace all session_ranks rows for a given session_id (NULL = seed).
// Deletes existing rows first, then inserts playerIds in rank order.
export async function setSessionRanks(
  db: D1Database, sessionId: number | null, playerIds: number[]
): Promise<void> {
  if (playerIds.length === 0) return;
  const deleteStmt = sessionId === null
    ? db.prepare('DELETE FROM session_ranks WHERE session_id IS NULL')
    : db.prepare('DELETE FROM session_ranks WHERE session_id = ?').bind(sessionId);
  const insertStmts = playerIds.map((pid, i) =>
    db.prepare('INSERT INTO session_ranks (session_id, player_id, rank_position) VALUES (?, ?, ?)')
      .bind(sessionId, pid, i + 1)
  );
  await db.batch([deleteStmt, ...insertStmts]);
}

// Replace the full leaderboard: re-rank all listed players, archive omitted ones.
export async function replaceLeaderboard(
  db: D1Database, clubId: number, names: string[]
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db.prepare("UPDATE players SET archived_at = date('now') WHERE club_id = ? AND archived_at IS NULL")
      .bind(clubId)
  );

  for (const name of names) {
    stmts.push(
      db.prepare('INSERT INTO players (club_id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(clubId, name)
    );
    stmts.push(
      db.prepare('UPDATE players SET archived_at = NULL WHERE club_id = ? AND name = ?')
        .bind(clubId, name)
    );
  }

  await db.batch(stmts);

  // Write seed rows (session_id = NULL) for the newly ordered players
  const stmts2: D1PreparedStatement[] = [
    db.prepare('DELETE FROM session_ranks WHERE session_id IS NULL'),
    ...names.map((name, i) =>
      db.prepare('INSERT INTO session_ranks (session_id, player_id, rank_position) SELECT NULL, id, ? FROM players WHERE club_id = ? AND name = ? AND archived_at IS NULL')
        .bind(i + 1, clubId, name)
    ),
  ];
  await db.batch(stmts2);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByDate(
  db: D1Database, clubId: number, date: string
): Promise<{ id: number; date: string; status: SessionStatus; created_at: string; closed_at: string | null } | null> {
  return db
    .prepare('SELECT id, date, status, created_at, closed_at FROM sessions WHERE club_id = ? AND date = ?')
    .bind(clubId, date)
    .first();
}

export async function listSessions(
  db: D1Database, clubId: number
): Promise<{ date: string; status: SessionStatus }[]> {
  const { results } = await db
    .prepare('SELECT date, status FROM sessions WHERE club_id = ? ORDER BY date DESC')
    .bind(clubId)
    .all<{ date: string; status: SessionStatus }>();
  return results;
}

export async function createSession(
  db: D1Database, clubId: number, date: string
): Promise<number> {
  const result = await db
    .prepare("INSERT INTO sessions (club_id, date, status, created_at) VALUES (?, ?, 'attendance', datetime('now'))")
    .bind(clubId, date)
    .run();
  return result.meta.last_row_id as number;
}

export async function updateSessionStatus(
  db: D1Database, sessionId: number, status: SessionStatus, closedAt?: string
): Promise<void> {
  if (closedAt) {
    await db
      .prepare('UPDATE sessions SET status = ?, closed_at = ? WHERE id = ?')
      .bind(status, closedAt, sessionId)
      .run();
  } else {
    await db
      .prepare('UPDATE sessions SET status = ? WHERE id = ?')
      .bind(status, sessionId)
      .run();
  }
}

// ── Attendees ─────────────────────────────────────────────────────────────────

export async function getAttendeeNames(db: D1Database, sessionId: number): Promise<string[]> {
  const { results } = await db
    .prepare(`
      SELECT p.name FROM attendees a
      JOIN players p ON p.id = a.player_id
      JOIN session_ranks sr ON sr.player_id = p.id AND sr.session_id = a.session_id
      WHERE a.session_id = ?
      ORDER BY sr.rank_position
    `)
    .bind(sessionId)
    .all<{ name: string }>();
  return results.map(r => r.name);
}

export async function setAttendance(
  db: D1Database, sessionId: number, playerId: number, attending: boolean
): Promise<void> {
  if (attending) {
    await db
      .prepare('INSERT OR IGNORE INTO attendees (session_id, player_id) VALUES (?, ?)')
      .bind(sessionId, playerId)
      .run();
  } else {
    await db
      .prepare('DELETE FROM attendees WHERE session_id = ? AND player_id = ?')
      .bind(sessionId, playerId)
      .run();
  }
}

// ── Boxes ─────────────────────────────────────────────────────────────────────

interface BoxRow { box_id: number; box_number: number; player_name: string; position: number }
interface MatchRow { match_id: number; box_id: number; match_number: number }
interface SetRow { match_id: number; set_number: number; score_a: number | null; score_b: number | null }

export async function getBoxes(db: D1Database, sessionId: number): Promise<Box[]> {
  const { results: boxRows } = await db
    .prepare(`
      SELECT b.id as box_id, b.box_number, p.name as player_name, bp.position
      FROM boxes b
      JOIN box_players bp ON bp.box_id = b.id
      JOIN players p ON p.id = bp.player_id
      WHERE b.session_id = ?
      ORDER BY b.box_number, bp.position
    `)
    .bind(sessionId)
    .all<BoxRow>();

  const { results: matchRows } = await db
    .prepare(`
      SELECT m.id as match_id, m.box_id, m.match_number
      FROM matches m
      JOIN boxes b ON b.id = m.box_id
      WHERE b.session_id = ?
      ORDER BY m.box_id, m.match_number
    `)
    .bind(sessionId)
    .all<MatchRow>();

  const { results: setRows } = await db
    .prepare(`
      SELECT ms.match_id, ms.set_number, ms.score_a, ms.score_b
      FROM match_sets ms
      JOIN matches m ON m.id = ms.match_id
      JOIN boxes b ON b.id = m.box_id
      WHERE b.session_id = ?
      ORDER BY ms.match_id, ms.set_number
    `)
    .bind(sessionId)
    .all<SetRow>();

  const boxMap = new Map<number, { box_number: number; players: string[] }>();
  for (const r of boxRows) {
    if (!boxMap.has(r.box_id)) boxMap.set(r.box_id, { box_number: r.box_number, players: [] });
    boxMap.get(r.box_id)!.players.push(r.player_name);
  }

  const setsByMatch = new Map<number, Array<[number | '', number | '']>>();
  for (const s of setRows) {
    if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, []);
    const arr = setsByMatch.get(s.match_id)!;
    arr[s.set_number] = [s.score_a ?? '', s.score_b ?? ''];
  }

  const matchesByBox = new Map<number, Match[]>();
  for (const m of matchRows) {
    if (!matchesByBox.has(m.box_id)) matchesByBox.set(m.box_id, []);
    const sets = setsByMatch.get(m.match_id) ?? [];
    const pairing = getPairing(boxMap.get(m.box_id)!.players.length, m.match_number);
    matchesByBox.get(m.box_id)!.push({ ...pairing, sets });
  }

  return [...boxMap.entries()]
    .sort((a, b) => a[1].box_number - b[1].box_number)
    .map(([boxId, { players }]) => ({
      players,
      matches: matchesByBox.get(boxId) ?? [],
      finalPlacings: null,
    }));
}

const PAIRINGS_4 = [
  { pair1: [0, 1], pair2: [2, 3] },
  { pair1: [0, 2], pair2: [1, 3] },
  { pair1: [0, 3], pair2: [1, 2] },
];
const PAIRINGS_5 = [
  { pair1: [0, 1], pair2: [2, 4] },
  { pair1: [2, 3], pair2: [1, 4] },
  { pair1: [0, 2], pair2: [3, 4] },
  { pair1: [0, 3], pair2: [1, 2] },
  { pair1: [0, 4], pair2: [1, 3] },
];

function getPairing(boxSize: number, matchNumber: number): { pair1: number[]; pair2: number[] } {
  const table = boxSize === 4 ? PAIRINGS_4 : boxSize === 5 ? PAIRINGS_5 : [];
  return table[matchNumber] ?? { pair1: [], pair2: [] };
}

export async function clearBoxes(db: D1Database, sessionId: number): Promise<void> {
  const { results: boxIds } = await db
    .prepare('SELECT id FROM boxes WHERE session_id = ?')
    .bind(sessionId)
    .all<{ id: number }>();

  if (boxIds.length === 0) return;

  const { results: matchIds } = await db
    .prepare(`SELECT id FROM matches WHERE box_id IN (${boxIds.map(() => '?').join(',')})`)
    .bind(...boxIds.map(b => b.id))
    .all<{ id: number }>();

  const stmts: D1PreparedStatement[] = [];

  if (matchIds.length > 0) {
    for (const m of matchIds) {
      stmts.push(db.prepare('DELETE FROM match_sets WHERE match_id = ?').bind(m.id));
    }
    for (const m of matchIds) {
      stmts.push(db.prepare('DELETE FROM matches WHERE id = ?').bind(m.id));
    }
  }
  for (const b of boxIds) {
    stmts.push(db.prepare('DELETE FROM box_players WHERE box_id = ?').bind(b.id));
    stmts.push(db.prepare('DELETE FROM boxes WHERE id = ?').bind(b.id));
  }

  await db.batch(stmts);
}

export async function saveBoxes(
  db: D1Database, sessionId: number, boxes: Box[],
  playerIdByName: Map<string, number>
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  for (let bi = 0; bi < boxes.length; bi++) {
    stmts.push(
      db.prepare('INSERT INTO boxes (session_id, box_number) VALUES (?, ?)')
        .bind(sessionId, bi)
    );
  }

  await db.batch(stmts);

  const { results: boxRows } = await db
    .prepare('SELECT id, box_number FROM boxes WHERE session_id = ? ORDER BY box_number')
    .bind(sessionId)
    .all<{ id: number; box_number: number }>();

  const stmts2: D1PreparedStatement[] = [];

  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi];
    const boxId = boxRows[bi].id;

    for (let pi = 0; pi < box.players.length; pi++) {
      const pid = playerIdByName.get(box.players[pi]);
      if (pid !== undefined) {
        stmts2.push(
          db.prepare('INSERT INTO box_players (box_id, player_id, position) VALUES (?, ?, ?)')
            .bind(boxId, pid, pi)
        );
      }
    }

    for (let mi = 0; mi < box.matches.length; mi++) {
      stmts2.push(
        db.prepare('INSERT INTO matches (box_id, match_number) VALUES (?, ?)')
          .bind(boxId, mi)
      );
    }
  }

  await db.batch(stmts2);

  const { results: matchRows } = await db
    .prepare(`
      SELECT m.id, m.box_id, m.match_number
      FROM matches m
      JOIN boxes b ON b.id = m.box_id
      WHERE b.session_id = ?
      ORDER BY m.box_id, m.match_number
    `)
    .bind(sessionId)
    .all<{ id: number; box_id: number; match_number: number }>();

  const matchesByBoxId = new Map<number, typeof matchRows>();
  for (const m of matchRows) {
    if (!matchesByBoxId.has(m.box_id)) matchesByBoxId.set(m.box_id, []);
    matchesByBoxId.get(m.box_id)!.push(m);
  }

  const stmts3: D1PreparedStatement[] = [];

  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi];
    const boxId = boxRows[bi].id;
    const boxMatches = matchesByBoxId.get(boxId) ?? [];

    for (let mi = 0; mi < box.matches.length; mi++) {
      const match = box.matches[mi];
      const matchId = boxMatches[mi]?.id;
      if (matchId === undefined) continue;

      for (let si = 0; si < match.sets.length; si++) {
        const [a, b] = match.sets[si];
        if (a === '' && b === '') continue;
        stmts3.push(
          db.prepare('INSERT OR REPLACE INTO match_sets (match_id, set_number, score_a, score_b) VALUES (?, ?, ?, ?)')
            .bind(matchId, si, a === '' ? null : a, b === '' ? null : b)
        );
      }
    }
  }

  if (stmts3.length > 0) await db.batch(stmts3);
}

export async function updateSetScore(
  db: D1Database,
  sessionId: number,
  boxNumber: number,
  matchNumber: number,
  setNumber: number,
  scoreA: number | null,
  scoreB: number | null
): Promise<boolean> {
  const match = await db
    .prepare(`
      SELECT m.id FROM matches m
      JOIN boxes b ON b.id = m.box_id
      WHERE b.session_id = ? AND b.box_number = ? AND m.match_number = ?
    `)
    .bind(sessionId, boxNumber, matchNumber)
    .first<{ id: number }>();

  if (!match) return false;

  await db
    .prepare('INSERT OR REPLACE INTO match_sets (match_id, set_number, score_a, score_b) VALUES (?, ?, ?, ?)')
    .bind(match.id, setNumber, scoreA, scoreB)
    .run();

  return true;
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function addPlayerMidSession(
  db: D1Database,
  clubId: number,
  sessionId: number,
  name: string,
  insertRank: number,
  boxesAssigned: boolean
): Promise<number> {
  const stmts: D1PreparedStatement[] = [
    // Shift ranks down in the open session's working state
    db.prepare('UPDATE session_ranks SET rank_position = rank_position + 1 WHERE session_id = ? AND rank_position >= ?')
      .bind(sessionId, insertRank),
    // Insert new player (no current_rank column)
    db.prepare('INSERT INTO players (club_id, name) VALUES (?, ?)')
      .bind(clubId, name),
  ];

  await db.batch(stmts);

  const newPlayer = await db
    .prepare('SELECT id FROM players WHERE club_id = ? AND name = ? AND archived_at IS NULL')
    .bind(clubId, name)
    .first<{ id: number }>();

  if (!newPlayer) throw new Error('Failed to insert player');

  const stmts2: D1PreparedStatement[] = [
    db.prepare('INSERT INTO session_ranks (session_id, player_id, rank_position) VALUES (?, ?, ?)')
      .bind(sessionId, newPlayer.id, insertRank),
    db.prepare('INSERT INTO attendees (session_id, player_id) VALUES (?, ?)')
      .bind(sessionId, newPlayer.id),
  ];

  if (boxesAssigned) {
    stmts2.push(
      db.prepare('DELETE FROM match_sets WHERE match_id IN (SELECT m.id FROM matches m JOIN boxes b ON b.id = m.box_id WHERE b.session_id = ?)')
        .bind(sessionId),
      db.prepare('DELETE FROM matches WHERE box_id IN (SELECT id FROM boxes WHERE session_id = ?)')
        .bind(sessionId),
      db.prepare('DELETE FROM box_players WHERE box_id IN (SELECT id FROM boxes WHERE session_id = ?)')
        .bind(sessionId),
      db.prepare('DELETE FROM boxes WHERE session_id = ?')
        .bind(sessionId),
      db.prepare("UPDATE sessions SET status = 'attendance' WHERE id = ?")
        .bind(sessionId)
    );
  }

  await db.batch(stmts2);
  return newPlayer.id;
}

// ── Club ──────────────────────────────────────────────────────────────────────

export async function getClub(
  db: D1Database, clubId: number
): Promise<{ id: number; name: string; short_name: string | null; config: string } | null> {
  return db
    .prepare('SELECT id, name, short_name, config FROM clubs WHERE id = ?')
    .bind(clubId)
    .first();
}

export async function getAdminRole(
  db: D1Database, clubId: number, email: string
): Promise<'owner' | 'admin' | null> {
  const row = await db
    .prepare('SELECT role FROM club_admins WHERE club_id = ? AND email = ?')
    .bind(clubId, email)
    .first<{ role: string }>();
  return row ? (row.role as 'owner' | 'admin') : null;
}
