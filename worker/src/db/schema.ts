// Drizzle schema: a typed mirror of the tables worker/migrations create. The
// migrations stay the source of truth; schema.test.ts fails if the two drift.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { SessionStatus } from '../types'

export const clubs = sqliteTable('clubs', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  /** JSON: club settings (timezone, HelloClub subdomain, ...). */
  config: text('config').notNull(),
})

export const players = sqliteTable('players', {
  id: integer('id').primaryKey(),
  clubId: integer('club_id')
    .notNull()
    .references(() => clubs.id),
  name: text('name').notNull(),
  hcMemberId: text('hc_member_id'),
  archivedAt: text('archived_at'),
  email: text('email'),
  preferredName: text('preferred_name'),
})

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

export const playerAuthProfiles = sqliteTable(
  'player_auth_profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    /** 'google', 'facebook', ... */
    provider: text('provider').notNull(),
    /** Stable id from the identity provider. */
    providerId: text('provider_id').notNull(),
    /** Provider email at time of HelloClub linking. */
    email: text('email'),
  },
  (t) => [unique().on(t.provider, t.providerId)],
)

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

export const playerRoles = sqliteTable(
  'player_roles',
  {
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.roleId] })],
)
