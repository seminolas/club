// Skill snapshots (domain/skill.ts; 0014). Each closed session gets the
// skill of everyone with a game in the club's closed sessions up to and
// including it; the current skill is the latest closed session's.
//
// A fit takes ~15 ms of CPU at two years' size: more than a Worker request
// gets on the free plan (10 ms), so in production it runs in a Durable Object
// (30 s per request); the Worker just waits for it. Snapshots are computed
// when missing: closing, re-opening or deleting a session deletes the
// snapshots from its date on, and the next fill recomputes them in order.
import * as db from '../db'
import type { DB } from '../db'
import { fitSkill } from '../domain/skill'
import { CLUB_ID } from './context'
import type { ServiceContext } from './context'

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 864e5

/** Compute every missing snapshot of the club's closed sessions, oldest first. */
export async function fillSkill(d: DB, clubId: number): Promise<number> {
  const sessions = await db.closedSessionsSkill(d, clubId)
  const missing = sessions.filter((s) => !s.hasSkill)
  if (!missing.length) return 0
  const games = (await db.skillGames(d, clubId)).map((g) => ({
    ...g,
    day: day(g.date),
  }))
  for (const s of missing)
    await db.saveSessionSkill(d, s.id, fitSkill(games, day(s.date)))
  return missing.length
}

/** Fill missing snapshots: in the club's Durable Object, or here in tests. */
export async function requestSkillFill(ctx: ServiceContext) {
  try {
    const ns = ctx.env.SESSION_ROOM
    if (!ns) {
      await fillSkill(ctx.db, CLUB_ID)
      return
    }
    const room = ns.get(ns.idFromName(`skill:${CLUB_ID}`))
    const res = await room.fetch('https://live/skill', { method: 'POST' })
    if (!res.ok) throw new Error(`skill fill: ${res.status}`)
  } catch (err) {
    // Never fails the change that asked for it: the ladder shows the last
    // snapshot, and the next read tries again.
    console.error('skill fill failed', err)
  }
}

/** A session's date on or after which snapshots are out of date. */
export async function skillChangedFrom(ctx: ServiceContext, date: string) {
  await db.deleteSkillFrom(ctx.db, CLUB_ID, date)
  await requestSkillFill(ctx)
}

/** Skill rank per player id, from the latest closed session's snapshot. */
export async function currentSkill(
  ctx: ServiceContext,
): Promise<Map<number, number>> {
  const read = async () => {
    const sessions = await db.closedSessionsSkill(ctx.db, CLUB_ID)
    return sessions.at(-1)
  }
  let latest = await read()
  if (!latest) return new Map()
  if (!latest.hasSkill) {
    await requestSkillFill(ctx)
    latest = await read()
    if (!latest?.hasSkill) return new Map()
  }
  const rows = await db.getSessionSkill(ctx.db, latest.id)
  return new Map(rows.map((r) => [r.playerId, r.rank]))
}
