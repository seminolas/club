// The old js/algorithm.js API, as globals for js/app.js and index.html, now
// built on the shared rules in ../domain. Same names and shapes as before:
// players are names, scores are numbers or '' as the score inputs hold them.
// Goes away as pages move to the new UI (MIGRATION.md, S5).
import {
  boxSizeOptions as domainBoxSizeOptions,
  buildBoxes,
  parseBoxLayout as domainParseBoxLayout,
} from '../domain/boxes'
import { applyMovement, cascadeTwoUpTwoDown } from '../domain/ladder'
import {
  getPairings as domainGetPairings,
  getSitOut,
  SUPPORTED_BOX_SIZES,
} from '../domain/pairings'
import {
  ALL_SET_FORMATS,
  evaluateMatch,
  isValidSet as domainIsValidSet,
} from '../domain/scoring'
import type { SetScore } from '../domain/scoring'
import { computeStandings } from '../domain/standings'

type Score = number | string | null | undefined
type SetPair = [Score, Score]
interface Match {
  pair1: number[]
  pair2: number[]
  sets: SetPair[]
}
interface Box {
  players: string[]
  matches: Match[]
  finalPlacings?: null
}

const isEmpty = (v: Score) => v === '' || v == null
const toSetScore = (s: SetPair): SetScore => [
  isEmpty(s[0]) ? null : Number(s[0]),
  isEmpty(s[1]) ? null : Number(s[1]),
]

// Fresh, unscored matches for a box of `size`; none for unsupported sizes.
export function getPairings(size: number): Match[] {
  if (!(SUPPORTED_BOX_SIZES as readonly number[]).includes(size)) return []
  return domainGetPairings(size).map((p) => ({
    pair1: [...p.pair1],
    pair2: [...p.pair2],
    sets: [],
  }))
}

// Box positions sitting out a given match.
export function getSitout(box: Box, matchIndex: number): number[] {
  if (!box.matches[matchIndex]) return []
  return getSitOut(box.players.length, matchIndex)
}

export function boxSizeOptions(n: number) {
  return domainBoxSizeOptions(n, SUPPORTED_BOX_SIZES)
}

export function splitBySizes(attendees: string[], sizes: number[]): string[][] {
  return buildBoxes(attendees, sizes)
}

export function buildBoxesFromLayout(layout: string[][]): Box[] {
  return layout.map((players) => ({
    players: [...players],
    matches: getPairings(players.length),
    finalPlacings: null,
  }))
}

export function parseBoxLayout(
  text: string,
  nameByDisplay: Map<string, string>,
) {
  return domainParseBoxLayout(text, nameByDisplay)
}

// Standings for one box, best first. Ties fall back to ladder position (box
// position when there's no ladder), using indexOf as the old code did.
export function computeBoxStandings(
  box: Box,
  leaderboardBefore: string[] | null,
) {
  const rank = (name: string) =>
    leaderboardBefore
      ? leaderboardBefore.indexOf(name)
      : box.players.indexOf(name)
  const standings = computeStandings(
    {
      players: box.players,
      // This API's pairs are box positions; the rules take players.
      matches: box.matches.map((m) => ({
        pairs: [
          m.pair1.map((i) => box.players[i]),
          m.pair2.map((i) => box.players[i]),
        ] as const,
        sets: (m.sets ?? []).map(toSetScore),
      })),
    },
    ALL_SET_FORMATS,
    rank,
  )
  return standings.map((s) => ({
    playerIdx: s.position,
    name: s.player,
    matchesWon: s.gamesWon,
    setsWon: s.setsWon,
    setsLost: s.setsLost,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
    leaderboardPos: rank(s.player),
    placing: s.placing,
  }))
}

// Blank scores count as 0 here, as they always have; callers check for blanks first.
export function isValidSet(a: Score, b: Score): boolean {
  return domainIsValidSet(Number(a), Number(b), ALL_SET_FORMATS)
}

export function isSetComplete(a: Score, b: Score): boolean {
  return !isEmpty(a) && !isEmpty(b) && isValidSet(a, b)
}

export function getMatchStatus(match: { sets?: SetPair[] }) {
  return evaluateMatch((match.sets ?? []).map(toSetScore), ALL_SET_FORMATS)
    .status
}

export function allScoresComplete(boxes: Box[]): boolean {
  return boxes.every((box) =>
    box.matches.every((m) => getMatchStatus(m) === 'complete'),
  )
}

export function buildAttendeeOrder(sortedBoxes: string[][]): string[] {
  return cascadeTwoUpTwoDown(sortedBoxes)
}

// The ladder after closing: 2 up, 2 down on each box's final standings.
export function applyLeaderboardUpdate(
  boxes: Box[],
  leaderboardBefore: string[],
): string[] {
  const sortedBoxes = boxes.map((box) =>
    computeBoxStandings(box, leaderboardBefore).map((s) => s.name),
  )
  return applyMovement(leaderboardBefore, sortedBoxes, '2up2down')
}

// Returns the next Tuesday from today (or today if today is Tuesday).
export function nextTuesday(fromDate?: string | Date): string {
  const d = fromDate ? new Date(fromDate) : new Date()
  const day = d.getDay()
  const daysUntilTuesday = day === 2 ? 0 : (2 - day + 7) % 7
  d.setDate(d.getDate() + daysUntilTuesday)
  // Use local date parts to avoid UTC offset issues (important for NZ timezone)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Format date as "Tue 10 Jun 2026"
export function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
