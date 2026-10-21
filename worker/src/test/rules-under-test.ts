// The rules implementation the characterization tests run against. Today it's
// the live browser script js/algorithm.js (loaded via its CommonJS export).
import { createRequire } from 'node:module';

export type Score = number | string | null;
export type SetPair = [Score, Score];
export interface Match { pair1: number[]; pair2: number[]; sets: SetPair[] }
export interface Box { players: string[]; matches: Match[]; finalPlacings?: null }
export interface Standing {
  playerIdx: number; name: string; matchesWon: number; setsWon: number; setsLost: number;
  pointsFor: number; pointsAgainst: number; placing: number;
}

export interface Rules {
  getPairings(size: number): Match[];
  getSitout(box: Box, matchIndex: number): number[];
  boxSizeOptions(n: number): { sizes: number[]; boxCount: number }[];
  splitBySizes(attendees: string[], sizes: number[]): string[][];
  buildBoxesFromLayout(layout: string[][]): Box[];
  parseBoxLayout(text: string, nameByDisplay: Map<string, string>): { layout: string[][]; errors: string[] };
  computeBoxStandings(box: Box, leaderboardBefore: string[] | null): Standing[];
  isValidSet(a: Score, b: Score): boolean;
  isSetComplete(a: Score, b: Score): boolean;
  getMatchStatus(match: { sets?: SetPair[] }): 'not_started' | 'in_progress' | 'invalid' | 'complete';
  allScoresComplete(boxes: Box[]): boolean;
  buildAttendeeOrder(sortedBoxes: string[][]): string[];
  applyLeaderboardUpdate(boxes: Box[], leaderboardBefore: string[]): string[];
  nextTuesday(fromDate?: string | Date): string;
  formatDate(isoDate: string): string;
}

export const rules = createRequire(import.meta.url)('../../../js/algorithm.js') as Rules;
