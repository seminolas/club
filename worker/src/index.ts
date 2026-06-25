import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, JwtPayload } from './types';
import { requireAdmin, signJwt, verifyGoogleToken } from './auth';
import * as db from './db';

type Variables = { jwtPayload: JwtPayload };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS — allow CF Pages origin in production; all origins in dev
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT'], allowHeaders: ['Content-Type', 'Authorization'] }));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Hard-coded to club_id=1 for now; extend to subdomain routing when multi-club.
const CLUB_ID = 1;

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const { id_token } = await c.req.json<{ id_token: string }>();
  if (!id_token) return c.json({ error: 'Missing id_token' }, 400);

  const email = await verifyGoogleToken(id_token, c.env.GOOGLE_CLIENT_ID);
  if (!email) return c.json({ error: 'Invalid Google token' }, 401);

  const role = await db.getAdminRole(c.env.DB, CLUB_ID, email);
  if (!role) return c.json({ error: 'Not authorised for this club' }, 403);

  const token = await signJwt({ sub: email, club_id: CLUB_ID, role }, c.env.JWT_SECRET);
  return c.json({ token, role });
});

// ── Config ────────────────────────────────────────────────────────────────────

app.get('/api/config', async (c) => {
  const club = await db.getClub(c.env.DB, CLUB_ID);
  if (!club) return c.json({ error: 'Club not found' }, 404);
  const config = JSON.parse(club.config);
  // Google client ID is not a secret — safe to expose to the browser for GIS initialization
  config.googleClientId = c.env.GOOGLE_CLIENT_ID;
  return c.json(config);
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (c) => {
  const players = await db.getLeaderboardPlayers(c.env.DB, CLUB_ID);
  return c.json({
    players: players.map(p => p.name),
    updatedAt: new Date().toISOString().split('T')[0],
  });
});

app.post('/api/leaderboard/import', requireAdmin, async (c) => {
  const { players } = await c.req.json<{ players: string[] }>();
  if (!Array.isArray(players) || players.length === 0) return c.json({ error: 'players array required' }, 400);
  await db.replaceLeaderboard(c.env.DB, CLUB_ID, players);
  return c.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (c) => {
  const sessions = await db.listSessions(c.env.DB, CLUB_ID);
  return c.json(sessions);
});

app.post('/api/sessions', requireAdmin, async (c) => {
  const { date } = await c.req.json<{ date: string }>();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Invalid date' }, 400);

  const existing = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (existing) return c.json({ error: 'Session already exists' }, 409);

  const sessionId = await db.createSession(c.env.DB, CLUB_ID, date);

  // Snapshot current leaderboard as 'before'
  const players = await db.getLeaderboardPlayers(c.env.DB, CLUB_ID);
  await db.insertSessionLb(c.env.DB, sessionId, players.map(p => p.id), 'before');

  const lbBefore = players.map(p => p.name);
  return c.json({ date, status: 'attendance', attendees: [], boxes: [], leaderboardBefore: lbBefore, leaderboardAfter: null }, 201);
});

app.get('/api/sessions/:date', async (c) => {
  const date = c.req.param('date');
  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);

  const [lbBefore, lbAfter, attendees, boxes] = await Promise.all([
    db.getSessionLb(c.env.DB, session.id, 'before'),
    db.getSessionLb(c.env.DB, session.id, 'after'),
    db.getAttendeeNames(c.env.DB, session.id),
    db.getBoxes(c.env.DB, session.id),
  ]);

  return c.json({
    date: session.date,
    status: session.status,
    attendees,
    boxes,
    leaderboardBefore: lbBefore,
    leaderboardAfter: lbAfter.length > 0 ? lbAfter : null,
  });
});

// Toggle attendance for a named player
app.put('/api/sessions/:date/attendance', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { player_name, attending } = await c.req.json<{ player_name: string; attending: boolean }>();

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'in_progress' || session.status === 'closed') {
    return c.json({ error: 'Cannot change attendance in this state' }, 400);
  }

  const player = await db.getPlayerByName(c.env.DB, CLUB_ID, player_name);
  if (!player) return c.json({ error: 'Player not found' }, 404);

  const hadBoxes = session.status === 'boxes_assigned';

  await db.setAttendance(c.env.DB, session.id, player.id, attending);

  if (hadBoxes) {
    await db.clearBoxes(c.env.DB, session.id);
    await db.updateSessionStatus(c.env.DB, session.id, 'attendance');
  }

  return c.json({ ok: true, boxesCleared: hadBoxes });
});

// Store computed box assignment from client
app.put('/api/sessions/:date/boxes', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { boxes } = await c.req.json<{ boxes: import('./types').Box[] }>();

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);

  await db.clearBoxes(c.env.DB, session.id);

  // Build name→id map from current players
  const players = await db.getLeaderboardPlayers(c.env.DB, CLUB_ID);
  const pidByName = new Map(players.map(p => [p.name, p.id]));

  await db.saveBoxes(c.env.DB, session.id, boxes, pidByName);
  await db.updateSessionStatus(c.env.DB, session.id, 'boxes_assigned');

  return c.json({ ok: true });
});

// Update a single set score
app.put('/api/sessions/:date/score', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { box_number, match_number, set_number, score_a, score_b } = await c.req.json<{
    box_number: number; match_number: number; set_number: number;
    score_a: number | null; score_b: number | null;
  }>();

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);

  const ok = await db.updateSetScore(c.env.DB, session.id, box_number, match_number, set_number, score_a, score_b);
  if (!ok) return c.json({ error: 'Match not found' }, 404);

  if (session.status === 'boxes_assigned') {
    await db.updateSessionStatus(c.env.DB, session.id, 'in_progress');
  }

  return c.json({ ok: true });
});

// Close session: accept new leaderboard order from client (computed by algorithm.js)
app.post('/api/sessions/:date/close', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { leaderboard_after } = await c.req.json<{ leaderboard_after: string[] }>();

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Already closed' }, 400);

  // Look up player IDs for the 'after' snapshot
  const allPlayers = await db.getLeaderboardPlayers(c.env.DB, CLUB_ID);
  const pidByName = new Map(allPlayers.map(p => [p.name, p.id]));

  const afterIds = leaderboard_after
    .map(name => pidByName.get(name))
    .filter((id): id is number => id !== undefined);

  await Promise.all([
    db.insertSessionLb(c.env.DB, session.id, afterIds, 'after'),
    db.updateRanksAfterClose(c.env.DB, CLUB_ID, leaderboard_after),
    db.updateSessionStatus(c.env.DB, session.id, 'closed', new Date().toISOString()),
  ]);

  return c.json({ ok: true });
});

// ── Players ───────────────────────────────────────────────────────────────────

app.post('/api/players', requireAdmin, async (c) => {
  const { name, insert_rank, session_date } = await c.req.json<{
    name: string; insert_rank: number; session_date: string;
  }>();

  if (!name || !insert_rank || !session_date) return c.json({ error: 'name, insert_rank, session_date required' }, 400);

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, session_date);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);

  const existing = await db.getPlayerByName(c.env.DB, CLUB_ID, name);
  if (existing) return c.json({ error: 'Player already exists' }, 409);

  const boxesAssigned = session.status === 'boxes_assigned' || session.status === 'in_progress';
  const newId = await db.addPlayerMidSession(c.env.DB, CLUB_ID, session.id, name, insert_rank, boxesAssigned);

  return c.json({ ok: true, id: newId, boxesCleared: boxesAssigned });
});

// ── HelloClub sync (server-side proxy) ────────────────────────────────────────

app.post('/api/hc/sync', requireAdmin, async (c) => {
  const { session_date } = await c.req.json<{ session_date: string }>();
  if (!session_date) return c.json({ error: 'session_date required' }, 400);

  const session = await db.getSessionByDate(c.env.DB, CLUB_ID, session_date);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const HC_BASE = `https://${c.env.HC_CLUB_ID}.helloclub.com/api`;
  const hcHeaders = { 'X-Api-Key': c.env.HC_API_KEY, 'Content-Type': 'application/json' };

  const log: Array<{ text: string; type: string }> = [];
  const emit = (text: string, type = 'info') => log.push({ text, type });

  try {
    // Find Box event for session date
    const eventRes = await fetch(
      `${HC_BASE}/event?fromDate=${session_date}T00:00:00Z&toDate=${session_date}T23:59:59Z&sort=startDate`,
      { headers: hcHeaders }
    );
    if (!eventRes.ok) {
      const body = await eventRes.text().catch(() => '');
      throw new Error(`HelloClub API error: ${eventRes.status}${body ? ' — ' + body : ''}`);
    }
    const eventData = await eventRes.json() as { events?: Array<{ id: string; name: string }> };
    const event = (eventData.events ?? []).find(e => e.name?.includes('Box'));
    if (!event) throw new Error(`No Box event found for ${session_date}`);

    emit(`Found event: "${event.name}"`);

    // Fetch registered attendees
    const attRes = await fetch(`${HC_BASE}/eventAttendee?event=${event.id}&limit=200`, { headers: hcHeaders });
    if (!attRes.ok) throw new Error(`Failed to fetch attendees: ${attRes.status}`);
    const attData = await attRes.json() as { attendees?: Array<{ member?: { id: string } }> };
    const registeredIds = new Set((attData.attendees ?? []).map(a => a.member?.id).filter(Boolean) as string[]);

    // Load session attendees with their hc_member_id
    const { results: attendeeRows } = await c.env.DB
      .prepare(`
        SELECT p.name, p.hc_member_id FROM attendees a
        JOIN players p ON p.id = a.player_id
        WHERE a.session_id = ?
      `)
      .bind(session.id)
      .all<{ name: string; hc_member_id: string | null }>();

    const alreadyIn: string[] = [], toSync: Array<{ name: string; hcId: string }> = [], notMapped: string[] = [];

    for (const { name, hc_member_id } of attendeeRows) {
      if (!hc_member_id) { notMapped.push(name); continue; }
      if (registeredIds.has(hc_member_id)) { alreadyIn.push(name); continue; }
      toSync.push({ name, hcId: hc_member_id });
    }

    emit('');
    emit(`Already in HelloClub (${alreadyIn.length}):`);
    if (alreadyIn.length === 0) emit('  (none)');
    for (const name of alreadyIn) emit(`  ✓ ${name}`, 'ok');

    emit('');
    emit(`To sync (${toSync.length + notMapped.length}):`);
    for (const { name } of toSync) emit(`  → ${name}`);
    for (const name of notMapped) emit(`  ? ${name}  (no HC ID)`, 'warn');

    let synced = 0, failed = 0;
    for (const { name, hcId } of toSync) {
      try {
        const res = await fetch(`${HC_BASE}/eventAttendee`, {
          method: 'POST',
          headers: hcHeaders,
          body: JSON.stringify({ event: event.id, member: hcId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        emit(`  ✓ ${name}`, 'ok');
        synced++;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        emit(`  ✗ ${name}: ${(e as Error).message}`, 'error');
        failed++;
      }
    }

    emit('');
    emit('─'.repeat(48));
    const parts = [];
    if (alreadyIn.length) parts.push(`${alreadyIn.length} already in HC`);
    if (synced) parts.push(`${synced} synced`);
    if (notMapped.length) parts.push(`${notMapped.length} no HC ID`);
    if (failed) parts.push(`${failed} failed`);
    emit(`Done. ${parts.join(', ')}.`);
  } catch (e) {
    emit('');
    emit(`Error: ${(e as Error).message}`, 'error');
  }

  return c.json({ log });
});

export default app;
