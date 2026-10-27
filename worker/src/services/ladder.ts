// The Players tab: the current ladder with each player's nights played and
// last night played (UI-PORT.md, U2).
import * as db from '../db'
import { cachedByVersion } from './cache'
import { CLUB_ID, ServiceError, requireAdmin } from './context'
import type { ServiceContext } from './context'
import { currentSkill } from './skill'

export interface LadderRow {
  id: number
  rank: number
  name: string
  preferredName: string | null
  hcMemberId: string | null
  /** Closed sessions attended. */
  nights: number
  /** Date (YYYY-MM-DD) of the last closed session attended, or null. */
  lastPlayed: string | null
  /** Rank by skill (domain/skill.ts), or null without a game yet. */
  skillRank: number | null
}

export async function ladder(ctx: ServiceContext): Promise<LadderRow[]> {
  const [players, version] = await Promise.all([
    db.getLeaderboardPlayers(ctx.db, CLUB_ID),
    db.closedSessionsVersion(ctx.db, CLUB_ID),
  ])
  const stats = await cachedByVersion(`played:${CLUB_ID}`, version, () =>
    db.playedStats(ctx.db, CLUB_ID),
  )
  const skill = await currentSkill(ctx)
  const byPlayer = new Map(stats.map((s) => [s.playerId, s]))
  return players.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name,
    preferredName: p.preferred_name,
    hcMemberId: p.hc_member_id,
    nights: byPlayer.get(p.id)?.nights ?? 0,
    lastPlayed: byPlayer.get(p.id)?.lastPlayed ?? null,
    skillRank: skill.get(p.id) ?? null,
  }))
}

/** Replace the ladder with these names, in order (admins; CSV import). */
export async function importLadder(ctx: ServiceContext, players: string[]) {
  await requireAdmin(ctx)
  if (!Array.isArray(players) || players.length === 0)
    throw new ServiceError('players array required', 400)
  await db.replaceLeaderboard(ctx.db, CLUB_ID, players)
}
