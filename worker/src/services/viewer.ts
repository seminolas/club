// Who's signed in, and "This is me" (V1).
import * as db from '../db'
import { CLUB_ID, signedIn } from './context'
import type { ServiceContext } from './context'

export interface Viewer {
  signedIn: boolean
  isAdmin: boolean
  /** The login's own name (Google), when signed in. */
  name?: string
  player?: { id: number; name: string } | null
  /** The login was linked to its player by email just now. */
  justLinked?: boolean
}

// A login with no player yet is linked here if exactly one player has its
// (Google-verified) email as their HelloClub email; otherwise the browser
// offers "This is me".
export async function loadViewer(ctx: ServiceContext): Promise<Viewer> {
  const session = await signedIn(ctx)
  if (!session) return { signedIn: false, isAdmin: false }
  const { user } = session
  let player = await db.getPlayerByUserId(ctx.db, CLUB_ID, user.id)
  let justLinked = false
  if (!player && user.emailVerified) {
    player = await db.autoLinkByEmail(ctx.db, CLUB_ID, user.id, user.email)
    justLinked = player !== null
  }
  return {
    signedIn: true,
    isAdmin: user.role === 'admin',
    name: user.name,
    player,
    justLinked,
  }
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(message)
  }
}

/** The players a signed-in login can pick: unlinked and active. */
export async function claimablePlayers(ctx: ServiceContext) {
  if (!(await signedIn(ctx))) throw new ServiceError('Unauthorized', 401)
  return db.listClaimablePlayers(ctx.db, CLUB_ID)
}

/** Link the signed-in login to a player; refused if someone has them. */
export async function claimPlayer(ctx: ServiceContext, playerId: number) {
  const session = await signedIn(ctx)
  if (!session) throw new ServiceError('Unauthorized', 401)
  if (!Number.isInteger(playerId))
    throw new ServiceError('player_id required', 400)
  const ok = await db.claimPlayer(ctx.db, CLUB_ID, playerId, session.user.id)
  if (!ok)
    throw new ServiceError(
      'That player is already linked to a sign-in. Ask an admin.',
      409,
    )
  return db.getPlayerByUserId(ctx.db, CLUB_ID, session.user.id)
}
