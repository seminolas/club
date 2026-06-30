export interface Env {
  DB: D1Database;
  HC_API_KEY: string;
  HC_CLUB_ID: string;
  HC_CLUB_SLUG: string;
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;
}

export interface JwtPayload {
  sub: string;      // email
  club_id: number;
  role: 'owner' | 'admin';
  exp: number;
}

// Shapes the frontend already expects (matches current JSON file format)

export interface LeaderboardResponse {
  players: string[];
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

export interface Box {
  players: string[];
  matches: Match[];
  finalPlacings: null;
}

export interface SessionResponse {
  date: string;
  status: SessionStatus;
  attendees: string[];
  boxes: Box[];
  leaderboardBefore: string[];
  leaderboardAfter: string[] | null;
}
