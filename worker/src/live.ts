// One Durable Object per session: the live channel for session night (S6a).
// Every screen on the session page holds a WebSocket to it. Score writes
// arrive over the socket and are applied strictly one at a time (live-core.ts),
// then broadcast; other changes (made through the REST API) are announced via
// POST /notify so screens reload the session. D1 stays the only store of
// session data; this object keeps just the ids of recent writes.
import { DurableObject } from 'cloudflare:workers'
import { handleWrite, parseClientMessage } from './live-core'
import type { SeenWrites, ServerMessage } from './live-core'
import type { Env } from './types'

const CLUB_ID = 1
const RECENT_WRITES = 2000

interface Attachment {
  date: string
  canWrite: boolean
}

export class SessionRoom extends DurableObject<Env> {
  // Writes run one after another, in arrival order.
  private queue: Promise<unknown> = Promise.resolve()

  async fetch(request: Request): Promise<Response> {
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
    server.serializeAttachment({
      date: request.headers.get('x-session-date') ?? '',
      canWrite: request.headers.get('x-can-write') === '1',
    } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = parseClientMessage(
      typeof raw === 'string' ? raw : new TextDecoder().decode(raw),
    )
    if (!msg) return
    const { date, canWrite } = ws.deserializeAttachment() as Attachment
    const run = this.queue.then(() =>
      handleWrite(
        {
          db: this.env.DB.withSession('first-primary'),
          clubId: CLUB_ID,
          date,
          canWrite,
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
