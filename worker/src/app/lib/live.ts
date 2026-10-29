// The session's live channel (S6a), ported from the old UI's _startLive and
// friends (js/app.js), with the same protocol and timings: a WebSocket to the
// session's Durable Object; score writes go out over it and are acknowledged;
// every screen gets each match's saved scores, and "changed" (after any other
// change) means reload the session. If the connection drops: reconnect with
// backoff, resend unacknowledged writes, refresh every 15 s meanwhile, and say
// so after 2 s ("reconnecting") and 15 s ("reload"). A missing pong, a write
// not acknowledged within 5 s, or a write on a closing socket all count as the
// connection being lost (a dead network can leave a socket "closing" forever).
import { useEffect, useRef, useState } from 'react'

export type LiveProblem = null | 'reconnecting' | 'reload'

export interface SetScoreOp {
  op: 'setScore'
  box: number
  match: number
  set: number
  a: number | null
  b: number | null
}

/** One match's saved scores, as the room broadcasts them. */
export type LiveSets = Array<[number | '', number | '']>

export interface LiveHandlers {
  /** A match's saved scores (from anyone, ourselves included). */
  onMatch: (box: number, match: number, sets: LiveSets) => void
  /**
   * Reload the session: something else changed, or we may have missed it.
   * `firstConnect`: the page's first connection, made right after it loaded
   * its data (the page may skip the reload if that data is fresh).
   */
  onChanged: (firstConnect?: boolean) => void
  onProblem: (problem: LiveProblem) => void
  /** Nothing of ours is in flight any more for this cell key. */
  onSettled?: (key: string) => void
}

interface Pending {
  id: string
  key: string
  op: SetScoreOp
}

export class LiveChannel {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private attempt = 0
  private closed = false
  private timers: ReturnType<typeof setTimeout>[] = []
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private poll: ReturnType<typeof setInterval> | undefined
  private awaitingPong = false
  private refused = false
  private problem: LiveProblem = null
  private everOpen = false

  constructor(
    private readonly date: string,
    private readonly handlers: LiveHandlers,
  ) {}

  start() {
    this.connect()
  }

  stop() {
    this.closed = true
    this.clearTimers()
    clearInterval(this.heartbeat)
    clearInterval(this.poll)
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      ws.close()
    }
  }

  /** Send a write; `key` names the cell it's for (e.g. "0-2-1"). */
  send(key: string, op: SetScoreOp) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const p = { id, key, op }
    this.pending.set(id, p)
    this.transmit(p)
  }

  /** A write for this cell is still waiting for its acknowledgement. */
  inFlight(key: string) {
    return [...this.pending.values()].some((p) => p.key === key)
  }

  private setProblem(problem: LiveProblem) {
    this.problem = problem
    this.handlers.onProblem(problem)
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  private connect = () => {
    if (this.closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(
      `${proto}://${location.host}/api/live/${this.date}`,
    )
    this.ws = ws
    ws.onopen = () => {
      this.attempt = 0
      this.clearTimers()
      // Back: everything unsent is resent, so only a refused write keeps the banner.
      if (!this.refused) this.setProblem(null)
      clearInterval(this.poll)
      this.poll = undefined
      // Heartbeat: the room answers "ping" with "pong" (without waking up);
      // no answer by the next beat means the connection is dead.
      this.awaitingPong = false
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => {
        if (this.awaitingPong) return this.lost()
        this.awaitingPong = true
        ws.send('ping')
      }, 15000)
      for (const p of this.pending.values()) this.transmit(p)
      const first = !this.everOpen
      this.everOpen = true
      this.handlers.onChanged(first) // catch up on anything missed
    }
    ws.onmessage = (ev: MessageEvent<string>) => {
      if (ev.data === 'pong') {
        this.awaitingPong = false
        return
      }
      this.onMessage(JSON.parse(ev.data))
    }
    ws.onclose = () => this.lost()
    ws.onerror = () => this.lost()
  }

  /** The connection is gone (closed, or silent): drop it and reconnect. */
  private lost() {
    if (this.closed || !this.ws) return
    const ws = this.ws
    this.ws = null
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try {
      ws.close()
    } catch {
      // already closed
    }
    clearInterval(this.heartbeat)
    this.clearTimers()
    this.timers.push(
      setTimeout(() => {
        if (!this.problem) this.setProblem('reconnecting')
      }, 2000),
    )
    this.timers.push(setTimeout(() => this.setProblem('reload'), 15000))
    if (!this.poll)
      this.poll = setInterval(() => this.handlers.onChanged(), 15000)
    this.attempt++
    this.timers.push(
      setTimeout(this.connect, Math.min(1000 * 2 ** (this.attempt - 1), 10000)),
    )
  }

  /** Send if connected; unacknowledged within 5 s means the connection is dead. */
  private transmit(p: Pending) {
    const ws = this.ws
    if (!ws || ws.readyState === WebSocket.CONNECTING) return // sent on open
    if (ws.readyState !== WebSocket.OPEN) return this.lost() // closing/closed: dead
    ws.send(JSON.stringify({ type: 'write', id: p.id, op: p.op }))
    setTimeout(() => {
      if (this.pending.has(p.id) && this.ws === ws) this.lost()
    }, 5000)
  }

  private onMessage(
    msg:
      | { type: 'ack'; id: string; ok: boolean }
      | { type: 'match'; box: number; match: number; sets: LiveSets }
      | { type: 'changed' },
  ) {
    if (msg.type === 'ack') {
      const p = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (p && !this.inFlight(p.key)) this.handlers.onSettled?.(p.key)
      if (!msg.ok) {
        this.refused = true
        this.setProblem('reload')
      }
    } else if (msg.type === 'match') {
      this.handlers.onMatch(msg.box, msg.match, msg.sets)
    } else {
      this.handlers.onChanged()
    }
  }
}

/**
 * The live channel for a session page, for as long as it's mounted. Returns
 * the connection problem to show (if any) and the channel, for writes.
 */
export function useSessionLive(
  date: string,
  handlers: Omit<LiveHandlers, 'onProblem'>,
) {
  const [problem, setProblem] = useState<LiveProblem>(null)
  const [channel, setChannel] = useState<LiveChannel | null>(null)
  // The latest handlers, without reconnecting when they change.
  const latest = useRef(handlers)
  latest.current = handlers
  useEffect(() => {
    const live = new LiveChannel(date, {
      onMatch: (...a) => latest.current.onMatch(...a),
      onChanged: (first) => latest.current.onChanged(first),
      onSettled: (key) => latest.current.onSettled?.(key),
      onProblem: setProblem,
    })
    live.start()
    setChannel(live)
    return () => {
      live.stop()
      setProblem(null)
    }
  }, [date])
  return { problem, channel }
}
