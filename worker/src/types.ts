export interface Env {
  DB: D1Database;
  HC_API_KEY: string;
  HC_CLUB_ID: string;
  HC_CLUB_SLUG: string;
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;
}

export interface JwtPayload {
  sub: string;      // player_id as string
  player_id: number;
  club_id: number;
  roles: ('owner' | 'admin' | 'scorer' | 'player')[];
  exp: number;
}

// Shapes the frontend already expects (matches current JSON file format)

export interface Player {
  id: number;
  name: string;
}

export interface LeaderboardResponse {
  players: Player[];
  updatedAt: string;
}

export interface SessionSummary {
  date: string;
  status: SessionStatus;
}

export type SessionStatus = 'attendance' | 'games' | 'closed';

export interface SetScore {
  0: number | '';
  1: number | '';
}

export interface Match {
  pair1: number[];
  pair2: number[];
  sets: Array<[number | '', number | '']>;
}

// Box as returned by GET — players are full {id, name} objects
export interface Box {
  players: Player[];
  matches: Match[];
  finalPlacings: null;
}

// Box as sent in PUT requests — players are IDs only
export interface BoxInput {
  players: number[];
  matches: Match[];
  finalPlacings: null;
}

export interface SessionResponse {
  date: string;
  status: SessionStatus;
  attendees: Player[];
  boxes: Box[];
  leaderboardBefore: Player[];
  leaderboardAfter: Player[] | null;
}
