// The live session's write logic (S6a), kept apart from the Durable Object
// wrapper (live.ts) so tests can run it against a plain D1. A write is applied,
// acknowledged to its sender, and the match's new scores are broadcast to
// every screen on the session.
import * as db from './db'
import type { DB } from './db'

export type Score = number | null

export interface SetScoreOp {
  op: 'setScore'
  box: number
  match: number
  set: number
  a: Score
  b: Score
}

export interface ClientMessage {
  type: 'write'
  /** Client-generated, so a write resent after a reconnect isn't applied twice. */
  id: string
  op: SetScoreOp
}

export type ServerMessage =
  | { type: 'ack'; id: string; ok: true }
  | { type: 'ack'; id: string; ok: false; error: string }
  /** A match's scores after a write, as GET /api/sessions/:date shows them. */
  | { type: 'match'; box: number; match: number; sets: db.SetScores }
  /** Something else changed (boxes, attendance, status): reload the session. */
  | { type: 'changed' }

const isIndex = (v: unknown, max: number) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max
const isScore = (v: unknown) => v === null || isIndex(v, 99)

/** The message, if it's a well-formed write; anything else is ignored. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  const msg = m as Partial<ClientMessage>
  const op = msg.op as Partial<SetScoreOp> | undefined
  if (
    msg.type !== 'write' ||
    typeof msg.id !== 'string' ||
    msg.id.length < 8 ||
    msg.id.length > 64 ||
    op?.op !== 'setScore' ||
    !isIndex(op.box, 50) ||
    !isIndex(op.match, 10) ||
    !isIndex(op.set, 2) ||
    !isScore(op.a) ||
    !isScore(op.b)
  )
    return null
  return msg as ClientMessage
}

/** Write ids already applied (the Durable Object keeps them in its storage). */
export interface SeenWrites {
  has: (id: string) => Promise<boolean>
  add: (id: string) => Promise<void>
}

/** Who's on this connection (set by the Worker from the sign-in). */
export interface Writer {
  isAdmin: boolean
  /** Their player, if signed in and linked. */
  playerId: number | null
}

export interface LiveContext {
  db: DB
  clubId: number
  date: string
  writer: Writer
  seen: SeenWrites
}

/** Apply one write: the reply for its sender, and what to broadcast. */
export async function handleWrite(
  ctx: LiveContext,
  msg: ClientMessage,
): Promise<{ reply: ServerMessage; broadcast?: ServerMessage }> {
  const fail = (error: string) => ({
    reply: { type: 'ack', id: msg.id, ok: false, error } as const,
  })
  // Admins: any box. Players (V3): any match in their own box.
  const { isAdmin, playerId } = ctx.writer
  if (!isAdmin && playerId === null)
    return fail('Sign in and pick your player to enter scores')
  const session = await db.getSessionByDate(ctx.db, ctx.clubId, ctx.date)
  if (!session) return fail('Session not found')
  const { box, match, set, a, b } = msg.op
  if (!isAdmin && !(await db.isPlayerInBox(ctx.db, session.id, box, playerId!)))
    return fail('You can only enter scores for your own box')
  if (!(await ctx.seen.has(msg.id))) {
    if (session.status === 'closed') return fail('Session is closed')
    const ok = await db.updateSetScore(
      ctx.db,
      session.id,
      box,
      match,
      set,
      a,
      b,
    )
    if (!ok) return fail('Match not found')
    await ctx.seen.add(msg.id)
  }
  // A resent write is acknowledged again; either way everyone gets the
  // match's current scores.
  const sets = await db.getMatchSets(ctx.db, session.id, box, match)
  return {
    reply: { type: 'ack', id: msg.id, ok: true },
    broadcast: sets ? { type: 'match', box, match, sets } : undefined,
  }
}
