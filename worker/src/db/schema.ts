// Drizzle schema: a typed mirror of the tables worker/migrations create. The
// migrations stay the source of truth; schema.test.ts fails if the two drift.
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import type { SessionStatus } from '../types'

export const clubs = sqliteTable('clubs', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  /** JSON: club settings (timezone, HelloClub subdomain, ...). */
  config: text('config').notNull(),
})

// ── BetterAuth (S4) ──────────────────────────────────────────────────────────
// Its core tables plus the admin plugin's columns. `user.role` ('admin' |
// 'user') is the app's role: admin or player.

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  role: text('role').default('user'),
  banned: integer('banned', { mode: 'boolean' }),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('session_user_id').on(t.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    /** The provider's id for the person (Google: `sub`). */
    accountId: text('account_id').notNull(),
    /** 'google', 'facebook', or 'credential' (email + password). */
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('account_user_id').on(t.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
  },
  (t) => [index('verification_identifier').on(t.identifier)],
)

// ── Club data ────────────────────────────────────────────────────────────────

export const players = sqliteTable(
  'players',
  {
    id: integer('id').primaryKey(),
    clubId: integer('club_id')
      .notNull()
      .references(() => clubs.id),
    name: text('name').notNull(),
    hcMemberId: text('hc_member_id'),
    archivedAt: text('archived_at'),
    email: text('email'),
    preferredName: text('preferred_name'),
    /** The login (BetterAuth user) this player signs in with, if any. */
    userId: text('user_id').references(() => user.id),
  },
  (t) => [uniqueIndex('players_user_id').on(t.userId)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey(),
    clubId: integer('club_id')
      .notNull()
      .references(() => clubs.id),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    status: text('status').$type<SessionStatus>().notNull(),
    createdAt: text('created_at').notNull(),
    closedAt: text('closed_at'),
  },
  (t) => [uniqueIndex('sessions_club_date').on(t.clubId, t.date)],
)

/**
 * Ladder snapshots: per session a 'before' and an 'after' ladder; rows with
 * no session are the seed ladder used before the first session.
 */
export const sessionRanks = sqliteTable(
  'session_ranks',
  {
    sessionId: integer('session_id').references(() => sessions.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    rankPosition: integer('rank_position').notNull(),
    phase: text('phase').$type<'before' | 'after'>().notNull().default('after'),
  },
  (t) => [
    unique().on(t.sessionId, t.playerId, t.phase),
    index('session_ranks_session_phase').on(
      t.sessionId,
      t.phase,
      t.rankPosition,
    ),
  ],
)

export const attendees = sqliteTable(
  'attendees',
  {
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.playerId] })],
)

/**
 * Check-in audit: every change to who's coming, with who made it (the person,
 * not their login) and when. Append-only; `attendees` is the current state.
 */
export const attendanceEvents = sqliteTable(
  'attendance_events',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    attending: integer('attending', { mode: 'boolean' }).notNull(),
    byPlayerId: integer('by_player_id').references(() => players.id),
    /** UTC, YYYY-MM-DD HH:MM:SS */
    at: text('at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('attendance_events_session').on(t.sessionId, t.playerId, t.at)],
)

// Skill per closed session (0014; domain/skill.ts).
export const sessionSkill = sqliteTable(
  'session_skill',
  {
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    strength: real('strength').notNull(),
    rank: integer('rank').notNull(),
    games: integer('games').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.playerId] })],
)

export const boxes = sqliteTable(
  'boxes',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    /** 0-based, top box first. */
    boxNumber: integer('box_number').notNull(),
  },
  (t) => [index('boxes_session').on(t.sessionId, t.boxNumber)],
)

export const boxPlayers = sqliteTable(
  'box_players',
  {
    boxId: integer('box_id')
      .notNull()
      .references(() => boxes.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    /** 0-based position in the box (pairings refer to these). */
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.boxId, t.playerId] })],
)

export const matches = sqliteTable(
  'matches',
  {
    id: integer('id').primaryKey(),
    boxId: integer('box_id')
      .notNull()
      .references(() => boxes.id),
    matchNumber: integer('match_number').notNull(),
  },
  (t) => [index('matches_box').on(t.boxId, t.matchNumber)],
)

export const matchSets = sqliteTable(
  'match_sets',
  {
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    setNumber: integer('set_number').notNull(),
    scoreA: integer('score_a'),
    scoreB: integer('score_b'),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.setNumber] })],
)

export const matchPlayers = sqliteTable(
  'match_players',
  {
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    /** 0 = pair A, 1 = pair B */
    side: integer('side').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
)
