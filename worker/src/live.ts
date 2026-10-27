// One Durable Object per session: the live channel for session night (S6a).
// Every screen on the session page holds a WebSocket to it. Score writes
// arrive over the socket and are applied strictly one at a time (live-core.ts),
// then broadcast; other changes (made through the REST API) are announced via
// POST /notify so screens reload the session. D1 stays the only store of
// session data; this object keeps just the ids of recent writes.
import { DurableObject } from 'cloudflare:workers'
import { handleWrite, parseClientMessage } from './live-core'
import type { SeenWrites, ServerMessage, Writer } from './live-core'
import { fillSkill } from './services/skill'
import type { Env } from './types'

const CLUB_ID = 1
const RECENT_WRITES = 2000

interface Attachment {
  date: string
  writer: Writer
}

export class SessionRoom extends DurableObject<Env> {
  // Writes run one after another, in arrival order.
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Heartbeat: answer "ping" with "pong" without waking the object, so
    // screens can tell a dead connection from a quiet one.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  async fetch(request: Request): Promise<Response> {
    // Skill snapshots (services/skill.ts): the club's "skill:<club>" room
    // computes them, as a fit needs more CPU than a Worker request has.
    if (new URL(request.url).pathname === '/skill') {
      await fillSkill(this.env.DB.withSession('first-primary'), CLUB_ID)
      return new Response(null, { status: 204 })
    }
    if (new URL(request.url).pathname === '/notify') {
      this.broadcast({ type: 'changed' })
      return new Response(null, { status: 204 })
    }
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('Expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    // Hibernation API: the object can sleep while sockets stay open.
    this.ctx.acceptWebSocket(server)
    // Set by the Worker from the sign-in (the room isn't reachable otherwise).
    const playerId = Number(request.headers.get('x-player-id'))
    server.serializeAttachment({
      date: request.headers.get('x-session-date') ?? '',
      writer: {
        isAdmin: request.headers.get('x-is-admin') === '1',
        playerId: Number.isInteger(playerId) && playerId > 0 ? playerId : null,
      },
    } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = parseClientMessage(
      typeof raw === 'string' ? raw : new TextDecoder().decode(raw),
    )
    if (!msg) return
    const { date, writer } = ws.deserializeAttachment() as Attachment
    const run = this.queue.then(() =>
      handleWrite(
        {
          db: this.env.DB.withSession('first-primary'),
          clubId: CLUB_ID,
          date,
          writer,
          seen: this.seen,
        },
        msg,
      ),
    )
    this.queue = run.catch(() => undefined)
    let result
    try {
      result = await run
    } catch (err) {
      console.error('live write failed', err)
      result = {
        reply: {
          type: 'ack',
          id: msg.id,
          ok: false,
          error: 'Something went wrong',
        } as const,
      }
    }
    ws.send(JSON.stringify(result.reply))
    if (result.broadcast) this.broadcast(result.broadcast)
  }

  webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'closing')
    } catch {
      // already closed
    }
  }

  private broadcast(m: ServerMessage) {
    const data = JSON.stringify(m)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(data)
      } catch {
        // gone; the runtime cleans it up
      }
    }
  }

  // Ids of the most recent writes, so a write resent after a reconnect is
  // acknowledged without being applied again.
  private seen: SeenWrites = {
    has: async (id) =>
      ((await this.ctx.storage.get<string[]>('recent')) ?? []).includes(id),
    add: async (id) => {
      const recent = (await this.ctx.storage.get<string[]>('recent')) ?? []
      recent.push(id)
      await this.ctx.storage.put('recent', recent.slice(-RECENT_WRITES))
    },
  }
}
