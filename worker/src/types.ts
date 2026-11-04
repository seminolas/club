export interface Env {
  DB: D1Database
  HC_API_KEY: string
  HC_CLUB_ID: string
  HC_CLUB_SLUG: string
  GOOGLE_CLIENT_ID: string
  /** BetterAuth: signs session cookies. */
  BETTER_AUTH_SECRET: string
  /** BetterAuth: this deployment's origin, e.g. https://club.….workers.dev */
  BETTER_AUTH_URL: string
  /** BetterAuth's Google sign-in (redirect flow). */
  GOOGLE_CLIENT_SECRET?: string
  /** '1' enables the test accounts' email + password sign-in (staging only). */
  TEST_LOGIN?: string
  /** The live session Durable Objects (S6a); absent in tests. */
  SESSION_ROOM?: DurableObjectNamespace
}

// Shapes the frontend already expects (matches current JSON file format)

export interface Player {
  id: number
  name: string
}

export interface LeaderboardResponse {
  players: Player[]
  updatedAt: string
}

export interface SessionSummary {
  date: string
  status: SessionStatus
}

export type SessionStatus = 'attendance' | 'games' | 'closed'

export interface SetScore {
  0: number | ''
  1: number | ''
}

export interface Match {
  /** Pair A and pair B, as player ids (players of the match's box). */
  pairs: [number[], number[]]
  sets: Array<[number | '', number | '']>
}

// Box as returned by GET — players are full {id, name} objects
export interface Box {
  players: Player[]
  matches: Match[]
  finalPlacings: null
}

// Box as sent in PUT requests — players are IDs only
export interface BoxInput {
  players: number[]
  matches: Match[]
  finalPlacings: null
}

/** One check-in change: a player marked or unmarked, by whom, when (V2). */
export interface CheckIn {
  /** The audit row's id: changes in order, and the same change seen twice. */
  id: number
  playerId: number
  attending: boolean
  /** The marker's player; null if unknown (an admin with no player). */
  by: { id: number; name: string } | null
  /** UTC, YYYY-MM-DD HH:MM:SS */
  at: string
}

export interface SessionResponse {
  date: string
  status: SessionStatus
  attendees: Player[]
  /** Every check-in change of the session, oldest first (V2). */
  checkIns: CheckIn[]
  boxes: Box[]
  leaderboardBefore: Player[]
  leaderboardAfter: Player[] | null
}
