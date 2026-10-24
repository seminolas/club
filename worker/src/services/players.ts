// A player's admin page: profile, sign-in link, HelloClub link (admins).
import * as db from '../db'
import { CLUB_ID, ServiceError, requireAdmin } from './context'
import type { ServiceContext } from './context'

function playerId(id: number) {
  if (!Number.isInteger(id)) throw new ServiceError('Invalid id', 400)
  return id
}

export async function playerProfile(ctx: ServiceContext, id: number) {
  await requireAdmin(ctx)
  const player = await db.getPlayerById(ctx.db, CLUB_ID, playerId(id))
  if (!player) throw new ServiceError('Not found', 404)
  return { ...player, login: await db.getPlayerLogin(ctx.db, id) }
}

export interface ProfileChange {
  name?: string
  email?: string | null
  hc_member_id?: string | null
  preferred_name?: string | null
}

export async function updatePlayer(
  ctx: ServiceContext,
  id: number,
  fields: ProfileChange,
) {
  await requireAdmin(ctx)
  await db.updatePlayerProfile(ctx.db, playerId(id), fields)
}

/** Remove the player's sign-in link (e.g. someone picked the wrong player). */
export async function unlinkPlayer(ctx: ServiceContext, id: number) {
  await requireAdmin(ctx)
  await db.unlinkPlayer(ctx.db, playerId(id))
}

/** Delete a player; refused once they have game data. */
export async function removePlayer(ctx: ServiceContext, id: number) {
  await requireAdmin(ctx)
  const result = await db.deletePlayer(ctx.db, playerId(id))
  if (!result.deleted)
    throw new ServiceError(result.reason ?? 'Not deleted', 409)
}

export interface HcMember {
  id: string
  name: string
  number: string | null
  email: string | null
}

/** Active HelloClub members matching a name (read-only HelloClub call). */
export async function searchHcMembers(
  ctx: ServiceContext,
  q: string,
): Promise<HcMember[]> {
  await requireAdmin(ctx)
  if (!q.trim()) return []
  const HC_BASE = `https://${ctx.env.HC_CLUB_ID}.helloclub.com/api`
  const res = await fetch(
    `${HC_BASE}/member?search=${encodeURIComponent(q)}&limit=15`,
    {
      headers: { 'X-Api-Key': ctx.env.HC_API_KEY, Accept: 'application/json' },
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HcError(`HC API error: ${res.status}${body ? ' — ' + body : ''}`)
  }
  const data = await res.json<{
    members?: Array<{
      id: string
      firstName: string
      lastName: string
      number?: string
      email?: string
      isArchived?: boolean
      isSuspended?: boolean
    }>
  }>()
  return (data.members ?? [])
    .filter((m) => !m.isArchived && !m.isSuspended)
    .map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      number: m.number ?? null,
      email: m.email ?? null,
    }))
}

/** HelloClub answered with an error (the API returns 502). */
export class HcError extends Error {}
