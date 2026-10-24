import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import type { BoxInput, Env } from './types'
import { getSession, requireAdmin } from './auth'
import { createAuth } from './better-auth'
import * as db from './db'
import type { DB } from './db'
import { CLUB_ID, ServiceError } from './services/context'
import type { ServiceContext } from './services/context'
import { importLadder } from './services/ladder'
import {
  HcError,
  playerProfile,
  removePlayer,
  searchHcMembers,
  unlinkPlayer,
  updatePlayer,
} from './services/players'
import type { ProfileChange } from './services/players'
import {
  addPlayer,
  closeSession,
  deleteSession,
  getSession as sessionNight,
  reopenAttendance,
  reopenSession,
  saveBoxes,
  setAttendance,
} from './services/session-night'
import { createSession } from './services/sessions'
import { claimPlayer, claimablePlayers, loadViewer } from './services/viewer'

// The live session Durable Object class, for the Workers runtime (S6a).
export { SessionRoom } from './live'

type Variables = { db: DB; userId?: string }
type AppContext = Context<{ Bindings: Env; Variables: Variables }>

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// CORS — allow CF Pages origin in production; all origins in dev
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

// Pin every query in this request to the primary, so a write is always visible
// to the very next read (e.g. GET /sessions/:date right after PUT /boxes).
// D1 read replicas otherwise only offer eventual consistency.
app.use('*', async (c, next) => {
  c.set('db', c.env.DB.withSession('first-primary'))
  await next()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

// The request as the shared services see it.
const ctx = (c: AppContext): ServiceContext => ({
  env: c.env,
  db: c.get('db'),
  headers: c.req.raw.headers,
})

// A service's result as JSON, or its refusal as `{ error }` with its status.
async function run(c: AppContext, fn: () => Promise<object>) {
  try {
    return c.json(await fn())
  } catch (e) {
    if (e instanceof ServiceError) return c.json({ error: e.message }, e.status)
    throw e
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// BetterAuth's own endpoints: sign-in (Google redirect; on staging also the
// test accounts' email + password), callback, sign-out, session.
app.on(['GET', 'POST'], '/api/auth/*', (c) =>
  createAuth(c.env, c.get('db')).handler(c.req.raw),
)

// Who's signed in, for the browser: name, admin or not, and their player.
// A login with no player yet is linked here if exactly one player has its
// (Google-verified) email as their HelloClub email; otherwise the browser
// offers "This is me".
app.get('/api/me', async (c) => c.json(await loadViewer(ctx(c))))

// "This is me": the players a signed-in login can pick, and picking one.
app.get('/api/me/claimable', (c) =>
  run(c, async () => ({ players: await claimablePlayers(ctx(c)) })),
)

app.post('/api/me/claim', async (c) => {
  const { player_id } = await c.req
    .json<{ player_id: number }>()
    .catch(() => ({ player_id: NaN }))
  return run(c, async () => ({
    ok: true,
    player: await claimPlayer(ctx(c), player_id),
  }))
})

// ── Live session (S6a) ────────────────────────────────────────────────────────

// The session's Durable Object (one per club + date).
const sessionRoom = (env: Env, date: string) =>
  env.SESSION_ROOM?.get(env.SESSION_ROOM.idFromName(`${CLUB_ID}:${date}`))

// A WebSocket to the session's live channel: everyone viewing gets updates;
// admins may enter any score, players (V3) their own box's.
app.get('/api/live/:date', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket')
    return c.json({ error: 'Expected a WebSocket' }, 426)
  const room = sessionRoom(c.env, c.req.param('date'))
  if (!room) return c.json({ error: 'Live updates unavailable' }, 503)
  const session = await getSession(c)
  const player = session
    ? await db.getPlayerByUserId(c.get('db'), CLUB_ID, session.user.id)
    : null
  // Overwrites anything the browser sent under these names.
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-session-date', c.req.param('date'))
  headers.set('x-is-admin', session?.user.role === 'admin' ? '1' : '0')
  headers.set('x-player-id', player ? String(player.id) : '')
  return room.fetch(new Request(c.req.raw.url, { headers }))
})

// Tell the session's screens to reload it (after changes made here, not
// through the live channel).
function notifyLive(
  c: { env: Env; executionCtx: { waitUntil: (p: Promise<unknown>) => void } },
  date: string,
) {
  const room = sessionRoom(c.env, date)
  if (!room) return
  const done = room
    .fetch('https://live/notify', { method: 'POST' })
    .catch((err: unknown) => console.error('live notify failed', err))
  try {
    c.executionCtx.waitUntil(done)
  } catch {
    // no execution context (tests)
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

app.get('/api/config', async (c) => {
  const club = await db.getClub(c.get('db'), CLUB_ID)
  if (!club) return c.json({ error: 'Club not found' }, 404)
  return c.json(JSON.parse(club.config))
})

// ── Leaderboard ───────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (c) => {
  const players = await db.getLeaderboardPlayers(c.get('db'), CLUB_ID)
  return c.json({
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hc_member_id: p.hc_member_id ?? null,
      preferred_name: p.preferred_name ?? null,
    })),
    updatedAt: new Date().toISOString().split('T')[0],
  })
})

app.post('/api/leaderboard/import', requireAdmin, async (c) => {
  const { players } = await c.req.json<{ players: string[] }>()
  return run(c, async () => {
    await importLadder(ctx(c), players)
    return { ok: true }
  })
})

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (c) => {
  const sessions = await db.listSessions(c.get('db'), CLUB_ID)
  return c.json(sessions)
})

app.post('/api/sessions', requireAdmin, async (c) => {
  const { date } = await c.req.json<{ date: string }>()
  try {
    return c.json(await createSession(ctx(c), date), 201)
  } catch (e) {
    if (e instanceof ServiceError) return c.json({ error: e.message }, e.status)
    throw e
  }
})

app.get('/api/sessions/:date', (c) =>
  run(c, () => sessionNight(ctx(c), c.req.param('date'))),
)

// Toggle attendance for a player by ID
app.put('/api/sessions/:date/attendance', requireAdmin, async (c) => {
  const { player_id, attending } = await c.req.json<{
    player_id: number
    attending: boolean
  }>()
  return run(c, async () => {
    await setAttendance(ctx(c), c.req.param('date'), player_id, attending)
    return { ok: true }
  })
})

// Store computed box assignment from client (player IDs in boxes.players)
app.put('/api/sessions/:date/boxes', requireAdmin, async (c) => {
  const { boxes } = await c.req.json<{ boxes: BoxInput[] }>()
  return run(c, async () => {
    await saveBoxes(ctx(c), c.req.param('date'), boxes)
    return { ok: true }
  })
})

// Update a single set score
app.put('/api/sessions/:date/score', requireAdmin, async (c) => {
  const date = c.req.param('date')
  const { box_number, match_number, set_number, score_a, score_b } =
    await c.req.json<{
      box_number: number
      match_number: number
      set_number: number
      score_a: number | null
      score_b: number | null
    }>()

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, date)
  if (!session) return c.json({ error: 'Not found' }, 404)
  if (session.status === 'closed')
    return c.json({ error: 'Session is closed' }, 400)

  const ok = await db.updateSetScore(
    c.get('db'),
    session.id,
    box_number,
    match_number,
    set_number,
    score_a,
    score_b,
  )
  if (!ok) return c.json({ error: 'Match not found' }, 404)

  notifyLive(c, date)
  return c.json({ ok: true })
})

// Close session: accept new leaderboard order as player IDs from client
app.post('/api/sessions/:date/close', requireAdmin, async (c) => {
  const { leaderboard_after } = await c.req.json<{
    leaderboard_after: number[]
  }>()
  return run(c, async () => {
    await closeSession(ctx(c), c.req.param('date'), leaderboard_after)
    return { ok: true }
  })
})

app.post('/api/sessions/:date/reopen', requireAdmin, (c) =>
  run(c, async () => {
    await reopenSession(ctx(c), c.req.param('date'))
    return { ok: true }
  }),
)

app.post('/api/sessions/:date/reopen-attendance', requireAdmin, (c) =>
  run(c, async () => {
    await reopenAttendance(ctx(c), c.req.param('date'))
    return { ok: true }
  }),
)

app.delete('/api/sessions/:date', requireAdmin, (c) =>
  run(c, async () => {
    await deleteSession(ctx(c), c.req.param('date'))
    return { ok: true }
  }),
)

// ── Players ───────────────────────────────────────────────────────────────────

app.get('/api/players/:id', requireAdmin, (c) =>
  run(c, () => playerProfile(ctx(c), parseInt(c.req.param('id')))),
)

// Unlink a player's sign-in (e.g. someone picked the wrong player).
app.post('/api/players/:id/unlink', requireAdmin, (c) =>
  run(c, async () => {
    await unlinkPlayer(ctx(c), parseInt(c.req.param('id')))
    return { ok: true }
  }),
)

app.put('/api/players/:id', requireAdmin, async (c) => {
  const body = await c.req.json<ProfileChange>()
  return run(c, async () => {
    await updatePlayer(ctx(c), parseInt(c.req.param('id')), body)
    return { ok: true }
  })
})

app.delete('/api/players/:id', requireAdmin, (c) =>
  run(c, async () => {
    await removePlayer(ctx(c), parseInt(c.req.param('id')))
    return { ok: true }
  }),
)

app.post('/api/players', requireAdmin, async (c) => {
  const { name, insert_rank, session_date } = await c.req.json<{
    name: string
    insert_rank: number
    session_date: string
  }>()
  return run(c, async () => ({
    ok: true,
    id: await addPlayer(ctx(c), {
      name,
      insertRank: insert_rank,
      date: session_date,
    }),
  }))
})

// ── HelloClub sync (server-side proxy) ────────────────────────────────────────

app.get('/api/hc/members', requireAdmin, async (c) => {
  try {
    return c.json({
      members: await searchHcMembers(ctx(c), c.req.query('q') ?? ''),
    })
  } catch (e) {
    if (e instanceof HcError) return c.json({ error: e.message }, 502)
    throw e
  }
})

app.post('/api/hc/sync', requireAdmin, async (c) => {
  const { session_date } = await c.req.json<{ session_date: string }>()
  if (!session_date) return c.json({ error: 'session_date required' }, 400)

  const session = await db.getSessionByDate(c.get('db'), CLUB_ID, session_date)
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const HC_BASE = `https://${c.env.HC_CLUB_ID}.helloclub.com/api`
  const hcKey = { 'X-Api-Key': c.env.HC_API_KEY }
  const hcJson = {
    ...hcKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-version': '2023-07-18',
    'x-club': c.env.HC_CLUB_SLUG,
    'x-hostname': `${c.env.HC_CLUB_ID}.helloclub.com`,
  }

  const log: Array<{ text: string; type: string }> = []
  const emit = (text: string, type = 'info') => log.push({ text, type })

  try {
    // Find Box event for session date
    const eventRes = await fetch(
      `${HC_BASE}/event?fromDate=${session_date}T00:00:00Z&toDate=${session_date}T23:59:59Z&sort=startDate`,
      { headers: hcKey },
    )
    if (!eventRes.ok) {
      const body = await eventRes.text().catch(() => '')
      throw new Error(
        `HelloClub API error: ${eventRes.status}${body ? ' — ' + body : ''}`,
      )
    }
    const eventData = await eventRes.json<{
      events?: Array<{ id: string; name: string }>
    }>()
    const event = (eventData.events ?? []).find((e) =>
      e.name?.includes('Senior Box'),
    )
    if (!event) throw new Error(`No Senior Box event found for ${session_date}`)

    emit(`Found event: "${event.name}"`)

    // Fetch registered attendees
    const attRes = await fetch(
      `${HC_BASE}/eventAttendee?event=${event.id}&limit=100`,
      { headers: hcKey },
    )
    if (!attRes.ok) {
      const body = await attRes.text().catch(() => '')
      throw new Error(
        `Failed to fetch attendees: ${attRes.status}${body ? ' — ' + body : ''}`,
      )
    }
    const attData = await attRes.json<{
      attendees?: Array<{ member?: { id: string } }>
    }>()
    const registeredIds = new Set(
      (attData.attendees ?? [])
        .map((a) => a.member?.id)
        .filter(Boolean) as string[],
    )

    // Load session attendees with their hc_member_id
    const { results: attendeeRows } = await c
      .get('db')
      .prepare(
        `
        SELECT p.name, p.hc_member_id FROM attendees a
        JOIN players p ON p.id = a.player_id
        WHERE a.session_id = ?
      `,
      )
      .bind(session.id)
      .all<{ name: string; hc_member_id: string | null }>()

    const alreadyIn: string[] = [],
      toSync: Array<{ name: string; hcId: string }> = [],
      notMapped: string[] = []

    for (const { name, hc_member_id } of attendeeRows) {
      if (!hc_member_id) {
        notMapped.push(name)
        continue
      }
      if (registeredIds.has(hc_member_id)) {
        alreadyIn.push(name)
        continue
      }
      toSync.push({ name, hcId: hc_member_id })
    }

    emit('')
    emit(`Already in HelloClub (${alreadyIn.length}):`)
    if (alreadyIn.length === 0) emit('  (none)')
    for (const name of alreadyIn) emit(`  ✓ ${name}`, 'ok')

    emit('')
    emit(`To sync (${toSync.length + notMapped.length}):`)
    for (const { name } of toSync) emit(`  → ${name}`)
    for (const name of notMapped) emit(`  ? ${name}  (no HC ID)`, 'warn')

    let synced = 0
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
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `Failed to sync attendees: ${res.status}${body ? ' — ' + body : ''}`,
        )
      }
      synced = toSync.length
      for (const { name } of toSync) emit(`  ✓ ${name}`, 'ok')
    }

    emit('')
    emit('─'.repeat(48))
    const parts = []
    if (alreadyIn.length) parts.push(`${alreadyIn.length} already in HC`)
    if (synced) parts.push(`${synced} synced`)
    if (notMapped.length) parts.push(`${notMapped.length} no HC ID`)
    emit(`Done. ${parts.join(', ')}.`)
  } catch (e) {
    emit('')
    emit(`Error: ${(e as Error).message}`, 'error')
  }

  return c.json({ log })
})

export default app
