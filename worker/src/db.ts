// D1 query helpers — all queries parameterised, no string interpolation.

import type { Box, Match, SessionStatus } from './types';

// Accepts either a plain D1Database or a D1DatabaseSession (see index.ts's
// withSession('first-primary') wrapper) — both expose prepare()/batch().
export type DB = Pick<D1Database, 'prepare' | 'batch'>;

// ── Leaderboard / session_ranks ───────────────────────────────────────────────

// Returns players ordered by their rank in the most recent session (or seed if none).
export async function getLeaderboardPlayers(
  db: DB, clubId: number
): Promise<{ id: number; name: string; hc_member_id: string | null; preferred_name: string | null }[]> {
  const { results } = await db
    .prepare(`
      SELECT p.id, p.name, p.hc_member_id, p.preferred_name FROM players p
      JOIN session_ranks sr ON sr.player_id = p.id
      LEFT JOIN sessions s ON s.id = sr.session_id
      WHERE p.club_id = ? AND p.archived_at IS NULL
        AND sr.session_id IS (SELECT id FROM sessions WHERE club_id = ? ORDER BY date DESC LIMIT 1)
        AND sr.phase = CASE WHEN COALESCE(s.status, 'closed') = 'closed' THEN 'after' ELSE 'before' END
      ORDER BY sr.rank_position
    `)
    .bind(clubId, clubId)
    .all<{ id: number; name: string; hc_member_id: string | null; preferred_name: string | null }>();
  return results;
}

export async function getPlayerByName(
  db: DB, clubId: number, name: string
): Promise<{ id: number; name: string } | null> {
  return db
    .prepare('SELECT id, name FROM players WHERE club_id = ? AND name = ? AND archived_at IS NULL')
    .bind(clubId, name)
    .first<{ id: number; name: string }>();
}

// Get ranked players for a given session_id and phase.
// Seed rows (session_id = null) have no phase distinction — all are returned.
export async function getSessionRanks(
  db: DB, sessionId: number | null, phase: 'before' | 'after' = 'after'
): Promise<{ id: number; name: string }[]> {
  const { results } = sessionId === null
    ? await db
        .prepare(`
          SELECT p.id, p.name FROM session_ranks sr
          JOIN players p ON p.id = sr.player_id
          WHERE sr.session_id IS NULL
          ORDER BY sr.rank_position
        `)
        .all<{ id: number; name: string }>()
    : await db
        .prepare(`
          SELECT p.id, p.name FROM session_ranks sr
          JOIN players p ON p.id = sr.player_id
          WHERE sr.session_id = ? AND sr.phase = ?
          ORDER BY sr.rank_position
        `)
        .bind(sessionId, phase)
        .all<{ id: number; name: string }>();
  return results;
}

// Replace all session_ranks rows for a given session_id and phase.
// Seed rows (session_id = null) are always phase 'after' — all seed rows are replaced.
export async function setSessionRanks(
  db: DB, sessionId: number | null, playerIds: number[], phase: 'before' | 'after' = 'after'
): Promise<void> {
  if (playerIds.length === 0) return;
  const deleteStmt = sessionId === null
    ? db.prepare('DELETE FROM session_ranks WHERE session_id IS NULL')
    : db.prepare('DELETE FROM session_ranks WHERE session_id = ? AND phase = ?').bind(sessionId, phase);
  const insertStmts = playerIds.map((pid, i) =>
    db.prepare('INSERT INTO session_ranks (session_id, player_id, rank_position, phase) VALUES (?, ?, ?, ?)')
      .bind(sessionId, pid, i + 1, phase)
  );
  await db.batch([deleteStmt, ...insertStmts]);
}

// Replace the full leaderboard: re-rank all listed players, archive omitted ones.
// Writes through to both seed rows and the most recent session's ranks so the
// live leaderboard reflects the import immediately.
export async function replaceLeaderboard(
  db: DB, clubId: number, names: string[]
): Promise<void> {
  // Build name → lowest-id map across all players (including archived).
  // Lowest id = the "original" record; duplicates created by past buggy imports stay archived.
  const { results: allPlayers } = await db
    .prepare('SELECT id, name FROM players WHERE club_id = ? ORDER BY id ASC')
    .bind(clubId)
    .all<{ id: number; name: string }>();
  const existingByName = new Map<string, number>();
  for (const p of allPlayers) {
    if (!existingByName.has(p.name)) existingByName.set(p.name, p.id);
  }

  // Archive everyone active, then unarchive existing players by id or insert new ones.
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE players SET archived_at = date('now') WHERE club_id = ? AND archived_at IS NULL").bind(clubId),
  ];
  for (const name of names) {
    if (existingByName.has(name)) {
      stmts.push(db.prepare('UPDATE players SET archived_at = NULL WHERE id = ?').bind(existingByName.get(name)!));
    } else {
      stmts.push(db.prepare('INSERT INTO players (club_id, name) VALUES (?, ?)').bind(clubId, name));
    }
  }
  await db.batch(stmts);

  // Re-query active players to pick up newly inserted IDs.
  const { results: active } = await db
    .prepare('SELECT id, name FROM players WHERE club_id = ? AND archived_at IS NULL ORDER BY id ASC')
    .bind(clubId)
    .all<{ id: number; name: string }>();
  const activeByName = new Map<string, number>();
  for (const p of active) {
    if (!activeByName.has(p.name)) activeByName.set(p.name, p.id);
  }

  const playerIds = names
    .map(name => activeByName.get(name))
    .filter((id): id is number => id !== undefined);

  // Write seed rows (used when no sessions exist).
  await setSessionRanks(db, null, playerIds);

  // Also overwrite the most recent session's ranks so getLeaderboardPlayers
  // returns the imported order immediately (not just after the next session).
  const latest = await db
    .prepare('SELECT id FROM sessions WHERE club_id = ? ORDER BY date DESC LIMIT 1')
    .bind(clubId)
    .first<{ id: number }>();
  if (latest) {
    await setSessionRanks(db, latest.id, playerIds);
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByDate(
  db: DB, clubId: number, date: string
): Promise<{ id: number; date: string; status: SessionStatus; created_at: string; closed_at: string | null } | null> {
  return db
    .prepare('SELECT id, date, status, created_at, closed_at FROM sessions WHERE club_id = ? AND date = ?')
    .bind(clubId, date)
    .first();
}

export async function listSessions(
  db: DB, clubId: number
): Promise<{ date: string; status: SessionStatus; attendee_count: number }[]> {
  const { results } = await db
    .prepare(`
      SELECT s.date, s.status, COUNT(a.player_id) AS attendee_count
      FROM sessions s
      LEFT JOIN attendees a ON a.session_id = s.id
      WHERE s.club_id = ?
      GROUP BY s.id
      ORDER BY s.date DESC
    `)
    .bind(clubId)
    .all<{ date: string; status: SessionStatus; attendee_count: number }>();
  return results;
}

export async function createSession(
  db: DB, clubId: number, date: string
): Promise<number> {
  const result = await db
    .prepare("INSERT INTO sessions (club_id, date, status, created_at) VALUES (?, ?, 'attendance', datetime('now'))")
    .bind(clubId, date)
    .run();
  return result.meta.last_row_id as number;
}

export async function updateSessionStatus(
  db: DB, sessionId: number, status: SessionStatus, closedAt?: string
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

export async function getAttendees(
  db: DB, sessionId: number
): Promise<{ id: number; name: string }[]> {
  const { results } = await db
    .prepare(`
      SELECT p.id, p.name FROM attendees a
      JOIN players p ON p.id = a.player_id
      LEFT JOIN session_ranks sr ON sr.player_id = p.id AND sr.session_id = a.session_id AND sr.phase = 'before'
      WHERE a.session_id = ?
      ORDER BY COALESCE(sr.rank_position, 9999)
    `)
    .bind(sessionId)
    .all<{ id: number; name: string }>();
  return results;
}

export async function setAttendance(
  db: DB, sessionId: number, playerId: number, attending: boolean
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

interface BoxRow { box_id: number; box_number: number; player_id: number; player_name: string; position: number }
interface MatchRow { match_id: number; box_id: number; match_number: number }
interface SetRow { match_id: number; set_number: number; score_a: number | null; score_b: number | null }

export async function getBoxes(db: DB, sessionId: number): Promise<Box[]> {
  const { results: boxRows } = await db
    .prepare(`
      SELECT b.id as box_id, b.box_number, p.id as player_id, p.name as player_name, bp.position
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

  const boxMap = new Map<number, { box_number: number; players: { id: number; name: string }[] }>();
  for (const r of boxRows) {
    if (!boxMap.has(r.box_id)) boxMap.set(r.box_id, { box_number: r.box_number, players: [] });
    boxMap.get(r.box_id)!.players.push({ id: r.player_id, name: r.player_name });
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

export async function clearBoxes(db: DB, sessionId: number): Promise<void> {
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
      stmts.push(db.prepare('DELETE FROM match_players WHERE match_id = ?').bind(m.id));
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

export async function deleteSession(db: DB, sessionId: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM match_players WHERE match_id IN (SELECT m.id FROM matches m JOIN boxes b ON b.id = m.box_id WHERE b.session_id = ?)').bind(sessionId),
    db.prepare('DELETE FROM match_sets WHERE match_id IN (SELECT m.id FROM matches m JOIN boxes b ON b.id = m.box_id WHERE b.session_id = ?)').bind(sessionId),
    db.prepare('DELETE FROM matches WHERE box_id IN (SELECT id FROM boxes WHERE session_id = ?)').bind(sessionId),
    db.prepare('DELETE FROM box_players WHERE box_id IN (SELECT id FROM boxes WHERE session_id = ?)').bind(sessionId),
    db.prepare('DELETE FROM boxes WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM attendees WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM session_ranks WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId),
  ]);
}

export async function saveBoxes(
  db: DB, sessionId: number, boxes: import('./types').BoxInput[]
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
      const pid = box.players[pi];
      stmts2.push(
        db.prepare('INSERT INTO box_players (box_id, player_id, position) VALUES (?, ?, ?)')
          .bind(boxId, pid, pi)
      );
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

      for (const pos of match.pair1) {
        stmts3.push(
          db.prepare('INSERT INTO match_players (match_id, player_id, side) VALUES (?, ?, 0)')
            .bind(matchId, box.players[pos])
        );
      }
      for (const pos of match.pair2) {
        stmts3.push(
          db.prepare('INSERT INTO match_players (match_id, player_id, side) VALUES (?, ?, 1)')
            .bind(matchId, box.players[pos])
        );
      }

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
  db: DB,
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

  if (scoreA === null && scoreB === null) {
    await db
      .prepare('DELETE FROM match_sets WHERE match_id = ? AND set_number = ?')
      .bind(match.id, setNumber)
      .run();
  } else {
    await db
      .prepare('INSERT OR REPLACE INTO match_sets (match_id, set_number, score_a, score_b) VALUES (?, ?, ?, ?)')
      .bind(match.id, setNumber, scoreA, scoreB)
      .run();
  }

  return true;
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function addPlayerMidSession(
  db: DB,
  clubId: number,
  sessionId: number,
  name: string,
  insertRank: number,
): Promise<number> {
  await db.batch([
    // Shift ranks down in the open session's before-state
    db.prepare("UPDATE session_ranks SET rank_position = rank_position + 1 WHERE session_id = ? AND phase = 'before' AND rank_position >= ?")
      .bind(sessionId, insertRank),
    db.prepare('INSERT INTO players (club_id, name) VALUES (?, ?)')
      .bind(clubId, name),
  ]);

  const newPlayer = await db
    .prepare('SELECT id FROM players WHERE club_id = ? AND name = ? AND archived_at IS NULL')
    .bind(clubId, name)
    .first<{ id: number }>();

  if (!newPlayer) throw new Error('Failed to insert player');

  await db.batch([
    db.prepare("INSERT INTO session_ranks (session_id, player_id, rank_position, phase) VALUES (?, ?, ?, 'before')")
      .bind(sessionId, newPlayer.id, insertRank),
    db.prepare('INSERT INTO attendees (session_id, player_id) VALUES (?, ?)')
      .bind(sessionId, newPlayer.id),
  ]);

  return newPlayer.id;
}

export async function getPlayerById(
  db: DB, clubId: number, id: number
): Promise<{ id: number; name: string; email: string | null; hc_member_id: string | null; preferred_name: string | null } | null> {
  return db
    .prepare('SELECT id, name, email, hc_member_id, preferred_name FROM players WHERE club_id = ? AND id = ? AND archived_at IS NULL')
    .bind(clubId, id)
    .first();
}

export async function updatePlayerProfile(
  db: DB, id: number, fields: { name?: string; email?: string | null; hc_member_id?: string | null; preferred_name?: string | null }
): Promise<void> {
  const setParts: string[] = [];
  const values: unknown[] = [];
  if ('name' in fields && fields.name) { setParts.push('name = ?'); values.push(fields.name); }
  if ('email' in fields) { setParts.push('email = ?'); values.push(fields.email ?? null); }
  if ('hc_member_id' in fields) { setParts.push('hc_member_id = ?'); values.push(fields.hc_member_id ?? null); }
  if ('preferred_name' in fields) { setParts.push('preferred_name = ?'); values.push(fields.preferred_name ?? null); }
  if (setParts.length === 0) return;
  values.push(id);
  await db
    .prepare(`UPDATE players SET ${setParts.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deletePlayer(
  db: DB, id: number
): Promise<{ deleted: boolean; reason?: string }> {
  const counts = await db
    .prepare(`SELECT
      (SELECT COUNT(*) FROM attendees     WHERE player_id = ?) +
      (SELECT COUNT(*) FROM box_players   WHERE player_id = ?) +
      (SELECT COUNT(*) FROM match_players WHERE player_id = ?) AS total`)
    .bind(id, id, id)
    .first<{ total: number }>();
  if (counts && counts.total > 0) {
    return { deleted: false, reason: 'Player has game data' };
  }
  await db.batch([
    db.prepare('DELETE FROM session_ranks WHERE player_id = ?').bind(id),
    db.prepare('DELETE FROM players WHERE id = ?').bind(id),
  ]);
  return { deleted: true };
}

// ── Auth profiles ─────────────────────────────────────────────────────────────

export async function getAuthProfiles(
  db: DB, playerId: number
): Promise<{ provider: string; provider_id: string; email: string | null }[]> {
  const { results } = await db
    .prepare('SELECT provider, provider_id, email FROM player_auth_profiles WHERE player_id = ?')
    .bind(playerId)
    .all<{ provider: string; provider_id: string; email: string | null }>();
  return results;
}

export async function findPlayerByAuthProfile(
  db: DB, provider: string, providerId: string
): Promise<{ id: number; name: string; preferred_name: string | null } | null> {
  return db
    .prepare(`SELECT p.id, p.name, p.preferred_name
      FROM players p
      JOIN player_auth_profiles a ON a.player_id = p.id
      WHERE a.provider = ? AND a.provider_id = ? AND p.archived_at IS NULL`)
    .bind(provider, providerId)
    .first<{ id: number; name: string; preferred_name: string | null }>();
}

export async function upsertAuthProfile(
  db: DB, playerId: number, provider: string, providerId: string, email: string | null
): Promise<void> {
  await db
    .prepare(`INSERT INTO player_auth_profiles (player_id, provider, provider_id, email)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider, provider_id) DO UPDATE SET email = excluded.email`)
    .bind(playerId, provider, providerId, email ?? null)
    .run();
}

// ── Club ──────────────────────────────────────────────────────────────────────

export async function getClub(
  db: DB, clubId: number
): Promise<{ id: number; name: string; short_name: string | null; config: string } | null> {
  return db
    .prepare('SELECT id, name, short_name, config FROM clubs WHERE id = ?')
    .bind(clubId)
    .first();
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export type RoleName = 'owner' | 'admin' | 'scorer' | 'player';

export async function getPlayerRoles(
  db: DB, playerId: number
): Promise<RoleName[]> {
  const { results } = await db
    .prepare(`SELECT r.name FROM player_roles pr JOIN roles r ON r.id = pr.role_id WHERE pr.player_id = ?`)
    .bind(playerId)
    .all<{ name: string }>();
  return results.map(r => r.name as RoleName);
}

export async function addPlayerRole(
  db: DB, playerId: number, role: RoleName
): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO player_roles (player_id, role_id)
      SELECT ?, id FROM roles WHERE name = ?`)
    .bind(playerId, role)
    .run();
}

export async function removePlayerRole(
  db: DB, playerId: number, role: RoleName
): Promise<void> {
  await db
    .prepare(`DELETE FROM player_roles WHERE player_id = ?
      AND role_id = (SELECT id FROM roles WHERE name = ?)`)
    .bind(playerId, role)
    .run();
}

export async function hasPlayerRole(
  db: DB, playerId: number, role: RoleName
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM player_roles pr JOIN roles r ON r.id = pr.role_id
      WHERE pr.player_id = ? AND r.name = ?`)
    .bind(playerId, role)
    .first();
  return row !== null;
}
