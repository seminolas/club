// Score entry over the live channel, ported from the old UI (js/app.js
// setScore, _scheduleScoreSave, _mergeMatchSets, _mergeSessionState): a typed
// score shows at once; each cell (box-match-game) is sent 0.4 s after the
// last keystroke; a cell keeps what was typed (incoming updates skip it)
// until its save is acknowledged. Scores live in the cached session.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { SetScore } from '../../domain/scoring'
import { sessionFn } from '../fns/session'
import type { LiveChannel, LiveSets } from './live'
import { withScore } from './scoreSheet'
import { toSetScores } from './session'
import type { Session, SessionMatch } from './session'

const cellKey = (bi: number, mi: number, si: number) => `${bi}-${mi}-${si}`
const SAVE_AFTER_MS = 400

const fromSetScores = (sets: readonly SetScore[]): SessionMatch['sets'] =>
  sets.map(([a, b]) => [a ?? '', b ?? ''])

const sameCell = (
  x: SessionMatch['sets'][number] | undefined,
  y: SessionMatch['sets'][number] | undefined,
) => (x?.[0] ?? '') === (y?.[0] ?? '') && (x?.[1] ?? '') === (y?.[1] ?? '')

/** A copy of the session with one match's sets replaced. */
function withMatch(
  s: Session,
  bi: number,
  mi: number,
  sets: SessionMatch['sets'],
): Session {
  return {
    ...s,
    boxes: s.boxes.map((b, i) =>
      i !== bi
        ? b
        : {
            ...b,
            matches: b.matches.map((m, j) => (j === mi ? { ...m, sets } : m)),
          },
    ),
  }
}

export function useScoreEntry(
  date: string,
  /** The session's live channel (set once it exists). */
  live: RefObject<LiveChannel | null>,
) {
  const queryClient = useQueryClient()
  const key = ['session', date]
  /** Cells being typed in or not yet confirmed saved. */
  const dirty = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const get = () => queryClient.getQueryData<Session>(key)
  const set = (s: Session) => queryClient.setQueryData<Session>(key, s)

  const schedule = (bi: number, mi: number, si: number) => {
    const k = cellKey(bi, mi, si)
    clearTimeout(timers.current.get(k))
    dirty.current.add(k)
    timers.current.set(
      k,
      setTimeout(() => {
        timers.current.delete(k)
        const [a, b] = get()?.boxes[bi]?.matches[mi]?.sets[si] ?? ['', '']
        live.current?.send(k, {
          op: 'setScore',
          box: bi,
          match: mi,
          set: si,
          a: a === '' ? null : Number(a),
          b: b === '' ? null : Number(b),
        })
      }, SAVE_AFTER_MS),
    )
  }

  /** One score typed (null: cleared). */
  const setScore = (
    bi: number,
    mi: number,
    si: number,
    side: 0 | 1,
    value: number | null,
  ) => {
    const s = get()
    const match = s?.boxes[bi]?.matches[mi]
    if (!s || !match || s.status === 'closed') return
    const before = match.sets
    const after = fromSetScores(withScore(toSetScores(before), si, side, value))
    set(withMatch(s, bi, mi, after))
    // Every game that changed is saved, including a third game dropped when
    // the first two became a sweep.
    for (let i = 0; i < Math.max(before.length, after.length); i++)
      if (!sameCell(before[i], after[i])) schedule(bi, mi, i)
  }

  /** Nothing of ours is in flight for this cell: it takes updates again. */
  const settled = useCallback((k: string) => {
    if (!timers.current.has(k)) dirty.current.delete(k)
  }, [])

  /** A match's saved sets, except in cells still being edited. */
  const mergeMatch = (bi: number, mi: number, remote: LiveSets) => {
    const s = get()
    const local = s?.boxes[bi]?.matches[mi]
    if (!s || !local) return
    const merged = [...local.sets]
    for (let si = 0; si < remote.length; si++)
      if (!dirty.current.has(cellKey(bi, mi, si))) merged[si] = remote[si]
    for (let si = merged.length - 1; si >= remote.length; si--)
      if (!dirty.current.has(cellKey(bi, mi, si))) merged.splice(si, 1)
    set(withMatch(s, bi, mi, merged))
  }

  /**
   * Reload the session from the server, keeping cells still being edited
   * (as long as their box still has the same players).
   */
  const refresh = async () => {
    const remote = await sessionFn({ data: date })
    const local = get()
    let next = remote
    if (local)
      for (const k of dirty.current) {
        const [bi, mi, si] = k.split('-').map(Number)
        const lb = local.boxes[bi]
        const rb = remote.boxes[bi]
        if (
          !lb ||
          !rb ||
          lb.players.map((p) => p.id).join() !==
            rb.players.map((p) => p.id).join()
        )
          continue
        const sets = [...(next.boxes[bi]?.matches[mi]?.sets ?? [])]
        while (sets.length <= si) sets.push(['', ''])
        sets[si] = lb.matches[mi]?.sets[si] ?? ['', '']
        next = withMatch(next, bi, mi, sets)
      }
    set(next)
  }

  return { setScore, settled, mergeMatch, refresh }
}
