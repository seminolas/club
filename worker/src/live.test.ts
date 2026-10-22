// The live session channel (S6a): the write logic against a real local D1,
// and the Durable Object class with fake sockets and storage.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import { SessionRoom } from './live'
import { handleWrite, parseClientMessage } from './live-core'
import type { ClientMessage, LiveContext, ServerMessage } from './live-core'
import { createTestDb } from './test/d1'
import type { TestDb } from './test/d1'
import { seed } from './test/fixtures/seed'
import type { Env } from './types'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
}, 60_000)
afterAll(() => t.dispose())
beforeEach(async () => {
  await t.clear()
  await seed(t.db)
})

const write = (
  id: string,
  box: number,
  match: number,
  set: number,
  a: number | null,
  b: number | null,
): ClientMessage => ({
  type: 'write',
  id,
  op: { op: 'setScore', box, match, set, a, b },
})

const seenSet = () => {
  const ids = new Set<string>()
  return {
    has: async (id: string) => ids.has(id),
    add: async (id: string) => void ids.add(id),
  }
}
const ctx = (over: Partial<LiveContext> = {}): LiveContext => ({
  db: t.db,
  clubId: 1,
  date: '2026-01-13', // in games
  writer: { isAdmin: true, playerId: null },
  seen: seenSet(),
  ...over,
})

describe('messages', () => {
  it('accepts a well-formed score write', () => {
    const m = write('write-0001', 0, 1, 1, 21, 9)
    expect(parseClientMessage(JSON.stringify(m))).toEqual(m)
  })

  it('ignores anything else', () => {
    for (const bad of [
      'not json',
      JSON.stringify({ type: 'hello' }),
      JSON.stringify(write('short', 0, 0, 0, 21, 9)),
      JSON.stringify(write('write-0001', 0, 0, 3, 21, 9)), // no set 4
      JSON.stringify(write('write-0001', 0, 0, 0, -1, 9)),
      JSON.stringify(write('write-0001', 0, 0, 0, 21.5, 9)),
      JSON.stringify({
        ...write('write-0001', 0, 0, 0, 21, 9),
        op: { op: 'close' },
      }),
    ])
      expect(parseClientMessage(bad)).toBeNull()
  })
})

describe('applying a write', () => {
  it('saves the set, acknowledges it and broadcasts the match', async () => {
    const r = await handleWrite(ctx(), write('write-0001', 0, 1, 1, 21, 9))
    expect(r.reply).toEqual({ type: 'ack', id: 'write-0001', ok: true })
    expect(r.broadcast).toEqual({
      type: 'match',
      box: 0,
      match: 1,
      sets: [
        [21, ''],
        [21, 9],
      ],
    })
    // As the session page shows it.
    expect((await db.getBoxes(t.db, 2))[0].matches[1].sets).toEqual(
      r.broadcast && 'sets' in r.broadcast ? r.broadcast.sets : null,
    )
  })

  it('clearing both scores removes the set', async () => {
    const r = await handleWrite(ctx(), write('write-0001', 0, 0, 1, null, null))
    expect(r.broadcast).toEqual({
      type: 'match',
      box: 0,
      match: 0,
      sets: [[21, 15]],
    })
  })

  it('refuses non-admins, closed sessions and unknown matches', async () => {
    const m = write('write-0001', 0, 1, 1, 21, 9)
    expect(
      (
        await handleWrite(
          ctx({ writer: { isAdmin: false, playerId: null } }),
          m,
        )
      ).reply,
    ).toMatchObject({
      ok: false,
      error: 'Sign in and pick your player to enter scores',
    })
    expect(
      (await handleWrite(ctx({ date: '2026-01-06' }), m)).reply,
    ).toMatchObject({ ok: false, error: 'Session is closed' })
    expect(
      (await handleWrite(ctx({ date: '2030-01-01' }), m)).reply,
    ).toMatchObject({ ok: false, error: 'Session not found' })
    expect(
      (await handleWrite(ctx(), write('write-0002', 7, 0, 0, 21, 9))).reply,
    ).toMatchObject({ ok: false, error: 'Match not found' })
    expect((await db.getBoxes(t.db, 2))[0].matches[1].sets).toEqual([[21, '']])
  })

  it('a resent write is acknowledged but not applied again', async () => {
    const c = ctx()
    await handleWrite(c, write('write-0001', 0, 1, 1, 21, 9))
    await handleWrite(c, write('write-0002', 0, 1, 1, 15, 21)) // a later correction
    const resent = await handleWrite(c, write('write-0001', 0, 1, 1, 21, 9))
    expect(resent.reply).toEqual({ type: 'ack', id: 'write-0001', ok: true })
    expect(resent.broadcast).toMatchObject({
      sets: [
        [21, ''],
        [15, 21],
      ],
    })
  })
})

describe('players entering scores (V3)', () => {
  // Session 2026-01-13: box 0 = Aroha, Ben, Mia, Dev Singh; box 1 = Ella, Chloe (3), Dev Patel, Finn, Isla.
  const asPlayer = (playerId: number) =>
    ctx({ writer: { isAdmin: false, playerId } })

  it('a player can enter any match in their own box, including ones they sit out', async () => {
    // Chloe is position 1 in box 1; match 2 ([0, 2] v [3, 4]) is one she sits out.
    expect(
      (await handleWrite(asPlayer(3), write('write-0001', 1, 2, 0, 21, 8)))
        .reply,
    ).toEqual({ type: 'ack', id: 'write-0001', ok: true })
    expect((await db.getBoxes(t.db, 2))[1].matches[2].sets).toEqual([[21, 8]])
  })

  it('but not another box', async () => {
    expect(
      (await handleWrite(asPlayer(3), write('write-0001', 0, 1, 1, 21, 9)))
        .reply,
    ).toMatchObject({
      ok: false,
      error: 'You can only enter scores for your own box',
    })
    expect((await db.getBoxes(t.db, 2))[0].matches[1].sets).toEqual([[21, '']])
  })

  it('nor a player who isn’t at the session, nor a closed session', async () => {
    expect(
      (await handleWrite(asPlayer(12), write('write-0001', 1, 0, 0, 21, 8)))
        .reply,
    ).toMatchObject({
      ok: false,
      error: 'You can only enter scores for your own box',
    })
    // Ella (6) was in box 1 on 2026-01-06, which is closed.
    expect(
      (
        await handleWrite(
          ctx({ date: '2026-01-06', writer: { isAdmin: false, playerId: 6 } }),
          write('write-0002', 1, 0, 0, 21, 8),
        )
      ).reply,
    ).toMatchObject({ ok: false, error: 'Session is closed' })
  })
})

describe('the Durable Object', () => {
  // D1 over the network answers out of order now and then; mimic that with a
  // random delay before every query, so ordering bugs would show.
  const jittery = (d: D1Database): D1Database => {
    const delay = () => new Promise((r) => setTimeout(r, Math.random() * 15))
    const wrapStmt = (st: D1PreparedStatement): D1PreparedStatement =>
      new Proxy(st, {
        get(target, prop) {
          const v = Reflect.get(target, prop) as unknown
          if (typeof v !== 'function') return v
          if (prop === 'bind')
            return (...args: unknown[]) =>
              wrapStmt(
                (v as (...a: unknown[]) => D1PreparedStatement).apply(
                  target,
                  args,
                ),
              )
          if (['all', 'first', 'run', 'raw'].includes(String(prop)))
            return async (...args: unknown[]) => {
              await delay()
              return (v as (...a: unknown[]) => unknown).apply(target, args)
            }
          return (v as (...a: unknown[]) => unknown).bind(target)
        },
      })
    return new Proxy(d, {
      get(target, prop) {
        const v = Reflect.get(target, prop) as unknown
        if (prop === 'prepare')
          return (q: string) => wrapStmt(target.prepare(q))
        if (prop === 'batch')
          return async (stmts: D1PreparedStatement[]) => {
            await delay()
            return target.batch(stmts)
          }
        if (prop === 'withSession') return () => jittery(target)
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(target)
          : v
      },
    })
  }

  // A SessionRoom with fake sockets and storage, over the (jittery) test D1.
  function room() {
    const sockets: { att: object; got: ServerMessage[]; ws: WebSocket }[] = []
    const store = new Map<string, unknown>()
    const state = {
      getWebSockets: () => sockets.map((s) => s.ws),
      acceptWebSocket: () => {},
      setWebSocketAutoResponse: () => {},
      storage: {
        get: async (k: string) => store.get(k),
        put: async (k: string, v: unknown) => void store.set(k, v),
      },
    } as unknown as DurableObjectState
    const r = new SessionRoom(state, { DB: jittery(t.raw) } as unknown as Env)
    const connect = (isAdmin: boolean, playerId: number | null = null) => {
      const s = {
        att: { date: '2026-01-13', writer: { isAdmin, playerId } },
        got: [] as ServerMessage[],
        ws: null as unknown as WebSocket,
      }
      s.ws = {
        send: (d: string) => s.got.push(JSON.parse(d) as ServerMessage),
        deserializeAttachment: () => s.att,
      } as unknown as WebSocket
      sockets.push(s)
      return s
    }
    return { r, connect }
  }

  it.each(Array.from({ length: 8 }, (_, i) => i + 1))(
    'applies writes sent at once in arrival order; everyone sees every update (run %i)',
    async () => {
      await t.raw
        .prepare(
          'DELETE FROM match_sets WHERE match_id IN (SELECT m.id FROM matches m JOIN boxes b ON b.id = m.box_id WHERE b.session_id = 2 AND b.box_number = 1 AND m.match_number = 1)',
        )
        .run()
      const { r, connect } = room()
      const admin = connect(true)
      const viewer = connect(false)
      // Fast typing: "2" then "21" for one score, then the other side, all at once.
      await Promise.all([
        r.webSocketMessage(
          admin.ws,
          JSON.stringify(write('write-0001', 1, 1, 0, 2, null)),
        ),
        r.webSocketMessage(
          admin.ws,
          JSON.stringify(write('write-0002', 1, 1, 0, 21, null)),
        ),
        r.webSocketMessage(
          admin.ws,
          JSON.stringify(write('write-0003', 1, 1, 0, 21, 1)),
        ),
        r.webSocketMessage(
          admin.ws,
          JSON.stringify(write('write-0004', 1, 1, 0, 21, 17)),
        ),
      ])
      expect((await db.getBoxes(t.db, 2))[1].matches[1].sets).toEqual([
        [21, 17],
      ])
      const acks = admin.got.filter((m) => m.type === 'ack')
      expect(acks.map((m) => m.type === 'ack' && m.id)).toEqual([
        'write-0001',
        'write-0002',
        'write-0003',
        'write-0004',
      ])
      const last = (got: ServerMessage[]) =>
        got.filter((m) => m.type === 'match').at(-1)
      expect(last(viewer.got)).toEqual({
        type: 'match',
        box: 1,
        match: 1,
        sets: [[21, 17]],
      })
      expect(last(admin.got)).toEqual(last(viewer.got))
    },
  )

  it('a viewer’s write is refused and nothing is broadcast', async () => {
    const { r, connect } = room()
    const viewer = connect(false)
    const other = connect(true)
    await r.webSocketMessage(
      viewer.ws,
      JSON.stringify(write('write-0001', 1, 1, 0, 21, 3)),
    )
    expect(viewer.got).toEqual([
      {
        type: 'ack',
        id: 'write-0001',
        ok: false,
        error: 'Sign in and pick your player to enter scores',
      },
    ])
    expect(other.got).toEqual([])
  })

  it('/notify tells every screen to reload the session', async () => {
    const { r, connect } = room()
    const a = connect(true)
    const b = connect(false)
    const res = await r.fetch(
      new Request('https://live/notify', { method: 'POST' }),
    )
    expect(res.status).toBe(204)
    expect([a.got, b.got]).toEqual([
      [{ type: 'changed' }],
      [{ type: 'changed' }],
    ])
  })
})
