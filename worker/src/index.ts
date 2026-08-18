import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, JwtPayload } from './types';
import { requireAdmin, signJwt, verifyGoogleToken } from './auth';
import * as db from './db';
import type { DB } from './db';

type Variables = { jwtPayload: JwtPayload; db: DB };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS — allow CF Pages origin in production; all origins in dev
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT'], allowHeaders: ['Content-Type', 'Authorization'] }));

// Pin every query in this request to the primary, so a write is always visible
// to the very next read (e.g. GET /sessions/:date right after PUT /boxes).
// D1 read replicas otherwise only offer eventual consistency.
app.use('*', async (c, next) => {
  c.set('db', c.env.DB.withSession('first-primary'));
  await next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Hard-coded to club_id=1 for now; extend to subdomain routing when multi-club.
const CLUB_ID = 1;

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const { id_token } = await c.req.json<{ id_token: string }>();
  if (!id_token) return c.json({ error: 'Missing id_token' }, 400);

  const google = await verifyGoogleToken(id_token, c.env.GOOGLE_CLIENT_ID);
  if (!google) return c.json({ error: 'Invalid Google token' }, 401);

  const profile = await db.findPlayerByAuthProfile(c.get('db'), 'google', google.sub);
  if (!profile) return c.json({ error: 'No player account is linked to this Google profile. Contact your club admin.' }, 403);

  const roles = await db.getPlayerRoles(c.get('db'), profile.id);
  const token = await signJwt({ sub: String(profile.id), player_id: profile.id, club_id: CLUB_ID, roles }, c.env.JWT_SECRET);
  return c.json({ token, roles, player: { id: profile.id, name: profile.name } });
});

// ── Config ────────────────────────────────────────────────────────────────────

app.get('/api/config', async (c) => {
  const club = await db.getClub(c.get('db'), CLUB_ID);
  if (!club) return c.json({ error: 'Club not found' }, 404);
  const config = JSON.parse(club.config);
  // Google client ID is not a secret — safe to expose to the browser for GIS initialization
  config.googleClientId = c.env.GOOGLE_CLIENT_ID;
  return c.json(config);
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (c) => {
  const players = await db.getLeaderboardPlayers(c.get('db'), CLUB_ID);
  return c.json({
    players: players.map(p => ({ id: p.id, name: p.name, hc_member_id: p.hc_member_id ?? null, preferred_name: p.preferred_name ?? null })),
    updatedAt: new Date().toISOString().split('T')[0],
  });
});

app.post('/api/leaderboard/import', requireAdmin, async (c) => {
  const { players } = await c.req.json<{ players: string[] }>();
  if (!Array.isArray(players) || players.length === 0) return c.json({ error: 'players array required' }, 400);
  await db.replaceLeaderboard(c.get('db'), CLUB_ID, players);
  return c.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (c) => {
  const sessions = await db.listSessions(c.get('db'), CLUB_ID);
  return c.json(sessions);
});

app.post('/api/sessions', requireAdmin, async (c) => {
  const { date } = await c.req.json<{ date: string }>();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Invalid date' }, 400);

  const existing = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (existing) return c.json({ error: 'Session already exists' }, 409);

  // Fetch leaderboard BEFORE creating the session — after creation the new
  // session becomes the most recent, making getLeaderboardPlayers return nothing.
  const players = await db.getLeaderboardPlayers(c.get('db'), CLUB_ID);

  const sessionId = await db.createSession(c.get('db'), CLUB_ID, date);
  await db.setSessionRanks(c.get('db'), sessionId, players.map(p => p.id), 'before');

  const lbBefore = players.map(p => ({ id: p.id, name: p.name }));
  return c.json({ date, status: 'attendance', attendees: [], boxes: [], leaderboardBefore: lbBefore, leaderboardAfter: null }, 201);
});

app.get('/api/sessions/:date', async (c) => {
  const date = c.req.param('date');
  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);

  let lbBefore: { id: number; name: string }[];
  let lbAfter: { id: number; name: string }[] | null = null;

  if (session.status === 'closed') {
    [lbBefore, lbAfter] = await Promise.all([
      db.getSessionRanks(c.get('db'), session.id, 'before'),
      db.getSessionRanks(c.get('db'), session.id, 'after'),
    ]);
  } else {
    lbBefore = await db.getSessionRanks(c.get('db'), session.id, 'before');
  }

  const [attendees, boxes] = await Promise.all([
    db.getAttendees(c.get('db'), session.id),
    db.getBoxes(c.get('db'), session.id),
  ]);

  return c.json({
    date: session.date,
    status: session.status,
    attendees,
    boxes,
    leaderboardBefore: lbBefore,
    leaderboardAfter: lbAfter,
  });
});

// Toggle attendance for a player by ID
app.put('/api/sessions/:date/attendance', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { player_id, attending } = await c.req.json<{ player_id: number; attending: boolean }>();

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'games' || session.status === 'closed') {
    return c.json({ error: 'Cannot change attendance in this state' }, 400);
  }

  await db.setAttendance(c.get('db'), session.id, player_id, attending);
  return c.json({ ok: true });
});

// Store computed box assignment from client (player IDs in boxes.players)
app.put('/api/sessions/:date/boxes', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { boxes } = await c.req.json<{ boxes: import('./types').BoxInput[] }>();

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);

  await db.clearBoxes(c.get('db'), session.id);
  await db.saveBoxes(c.get('db'), session.id, boxes);
  await db.updateSessionStatus(c.get('db'), session.id, 'games');

  return c.json({ ok: true });
});

// Update a single set score
app.put('/api/sessions/:date/score', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { box_number, match_number, set_number, score_a, score_b } = await c.req.json<{
    box_number: number; match_number: number; set_number: number;
    score_a: number | null; score_b: number | null;
  }>();

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);

  const ok = await db.updateSetScore(c.get('db'), session.id, box_number, match_number, set_number, score_a, score_b);
  if (!ok) return c.json({ error: 'Match not found' }, 404);

  return c.json({ ok: true });
});

// Close session: accept new leaderboard order as player IDs from client
app.post('/api/sessions/:date/close', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const { leaderboard_after } = await c.req.json<{ leaderboard_after: number[] }>();

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);

  await db.setSessionRanks(c.get('db'), session.id, leaderboard_after, 'after');
  await db.updateSessionStatus(c.get('db'), session.id, 'closed', new Date().toISOString());

  return c.json({ ok: true });
});

app.post('/api/sessions/:date/reopen', requireAdmin, async (c) => {
  const date = c.req.param('date') as string;
  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status !== 'closed') return c.json({ error: 'Session is not closed' }, 400);
  await db.updateSessionStatus(c.get('db'), session.id, 'games');
  return c.json({ ok: true });
});

app.post('/api/sessions/:date/reopen-attendance', requireAdmin, async (c) => {
  const date = c.req.param('date') as string;
  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  if (session.status !== 'games') return c.json({ error: 'Session is not in games state' }, 400);
  await db.clearBoxes(c.get('db'), session.id);
  await db.updateSessionStatus(c.get('db'), session.id, 'attendance');
  return c.json({ ok: true });
});

app.delete('/api/sessions/:date', requireAdmin, async (c) => {
  const date = c.req.param('date');
  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date);
  if (!session) return c.json({ error: 'Not found' }, 404);
  await db.deleteSession(c.get('db'), session.id);
  return c.json({ ok: true });
});

// ── Players ───────────────────────────────────────────────────────────────────

app.get('/api/players/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const player = await db.getPlayerById(c.get('db'), CLUB_ID, id);
  if (!player) return c.json({ error: 'Not found' }, 404);
  return c.json(player);
});

app.put('/api/players/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const body = await c.req.json<{ email?: string | null; hc_member_id?: string | null }>();
  await db.updatePlayerProfile(c.get('db'), id, body);
  return c.json({ ok: true });
});

app.delete('/api/players/:id', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
  const result = await db.deletePlayer(c.get('db'), id);
  if (!result.deleted) return c.json({ error: result.reason }, 409);
  return c.json({ ok: true });
});

app.post('/api/players', requireAdmin, async (c) => {
  const { name, insert_rank, session_date } = await c.req.json<{
    name: string; insert_rank: number; session_date: string;
  }>();

  if (!name || !insert_rank || !session_date) return c.json({ error: 'name, insert_rank, session_date required' }, 400);

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, session_date);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.status === 'closed') return c.json({ error: 'Session is closed' }, 400);
  if (session.status === 'games') return c.json({ error: 'Cannot add players during games — re-open attendance first' }, 400);

  const existing = await db.getPlayerByName(c.get('db'), CLUB_ID, name);
  if (existing) return c.json({ error: 'Player already exists' }, 409);

  const newId = await db.addPlayerMidSession(c.get('db'), CLUB_ID, session.id, name, insert_rank);

  return c.json({ ok: true, id: newId });
});

// ── HelloClub sync (server-side proxy) ────────────────────────────────────────

app.get('/api/hc/members', requireAdmin, async (c) => {
  const q = c.req.query('q') ?? '';
  if (!q.trim()) return c.json({ members: [] });

  const HC_BASE = `https://${c.env.HC_CLUB_ID}.helloclub.com/api`;
  const res = await fetch(
    `${HC_BASE}/member?search=${encodeURIComponent(q)}&limit=15`,
    { headers: { 'X-Api-Key': c.env.HC_API_KEY, 'Accept': 'application/json' } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return c.json({ error: `HC API error: ${res.status}${body ? ' — ' + body : ''}` }, 502);
  }
  const data = await res.json() as { members?: Array<{
    id: string; firstName: string; lastName: string;
    number?: string; email?: string; isArchived?: boolean; isSuspended?: boolean;
  }> };
  const members = (data.members ?? [])
    .filter(m => !m.isArchived && !m.isSuspended)
    .map(m => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      number: m.number ?? null,
      email: m.email ?? null,
    }));
  return c.json({ members });
});

app.post('/api/hc/sync', requireAdmin, async (c) => {
  const { session_date } = await c.req.json<{ session_date: string }>();
  if (!session_date) return c.json({ error: 'session_date required' }, 400);

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, session_date);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const HC_BASE = `https://${c.env.HC_CLUB_ID}.helloclub.com/api`;
  const hcKey = { 'X-Api-Key': c.env.HC_API_KEY };
  const hcJson = {
    ...hcKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-version': '2023-07-18',
    'x-club': c.env.HC_CLUB_SLUG,
    'x-hostname': `${c.env.HC_CLUB_ID}.helloclub.com`,
  };

  const log: Array<{ text: string; type: string }> = [];
  const emit = (text: string, type = 'info') => log.push({ text, type });

  try {
    // Find Box event for session date
    const eventRes = await fetch(
      `${HC_BASE}/event?fromDate=${session_date}T00:00:00Z&toDate=${session_date}T23:59:59Z&sort=startDate`,
      { headers: hcKey }
    );
    if (!eventRes.ok) {
      const body = await eventRes.text().catch(() => '');
      throw new Error(`HelloClub API error: ${eventRes.status}${body ? ' — ' + body : ''}`);
    }
    const eventData = await eventRes.json() as { events?: Array<{ id: string; name: string }> };
    const event = (eventData.events ?? []).find(e => e.name?.includes('Senior Box'));
    if (!event) throw new Error(`No Senior Box event found for ${session_date}`);

    emit(`Found event: "${event.name}"`);

    // Fetch registered attendees
    const attRes = await fetch(`${HC_BASE}/eventAttendee?event=${event.id}&limit=100`, { headers: hcKey });
    if (!attRes.ok) {
      const body = await attRes.text().catch(() => '');
      throw new Error(`Failed to fetch attendees: ${attRes.status}${body ? ' — ' + body : ''}`);
    }
    const attData = await attRes.json() as { attendees?: Array<{ member?: { id: string } }> };
    const registeredIds = new Set((attData.attendees ?? []).map(a => a.member?.id).filter(Boolean) as string[]);

    // Load session attendees with their hc_member_id
    const { results: attendeeRows } = await c.get('db')
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

    let synced = 0;
    if (toSync.length > 0) {
      const res = await fetch('https://api.helloclub.com/eventAttendee/many', {
        method: 'POST',
        headers: hcJson,
        body: JSON.stringify({
          event: event.id,
          feeMethod: 'rules',
          hasAttended: true,
          seriesHandling: 'instance',
          meta: {
            whoFor: 'specific',
            members: toSync.map(({ hcId }) => hcId),
            notifyByEmail: true,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to sync attendees: ${res.status}${body ? ' — ' + body : ''}`);
      }
      synced = toSync.length;
      for (const { name } of toSync) emit(`  ✓ ${name}`, 'ok');
    }

    emit('');
    emit('─'.repeat(48));
    const parts = [];
    if (alreadyIn.length) parts.push(`${alreadyIn.length} already in HC`);
    if (synced) parts.push(`${synced} synced`);
    if (notMapped.length) parts.push(`${notMapped.length} no HC ID`);
    emit(`Done. ${parts.join(', ')}.`);
  } catch (e) {
    emit('');
    emit(`Error: ${(e as Error).message}`, 'error');
  }

  return c.json({ log });
});

export default app;
