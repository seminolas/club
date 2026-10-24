// A session night's state for the new UI, on the shared rules
// (worker/src/domain): phases, match/box progress, and the ladder after
// closing. Players are ids. Mirrors the old UI's helpers in js/app.js and the
// browser bundle (worker/src/browser/algorithm.ts).
import { applyMovement } from '../../domain/ladder'
import { ALL_SET_FORMATS, evaluateMatch } from '../../domain/scoring'
import type { MatchStatus, SetScore } from '../../domain/scoring'
import { computeStandings } from '../../domain/standings'
import type { SessionResponse } from '../../types'

export type Session = SessionResponse
export type SessionBox = Session['boxes'][number]
export type SessionMatch = SessionBox['matches'][number]

/** Where the session is: check-in open, playing, or closed. */
export type Phase = 'checkin' | 'playing' | 'closed'
export function phaseOf(status: Session['status']): Phase {
  return status === 'attendance'
    ? 'checkin'
    : status === 'games'
      ? 'playing'
      : 'closed'
}

/** The API's scores ('' for blank) as the rules want them (null). */
export function toSetScores(sets: SessionMatch['sets']): SetScore[] {
  return sets.map(([a, b]) => [a === '' ? null : a, b === '' ? null : b])
}

export function matchStatus(match: SessionMatch): MatchStatus {
  return evaluateMatch(toSetScores(match.sets), ALL_SET_FORMATS).status
}

/** Finished boxes and matches across the night. */
export function progress(boxes: SessionBox[]) {
  const statuses = boxes.map((b) => b.matches.map(matchStatus))
  const done = (s: MatchStatus[]) => s.filter((x) => x === 'complete').length
  return {
    boxes: boxes.length,
    finishedBoxes: statuses.filter((s) => done(s) === s.length).length,
    matches: statuses.reduce((n, s) => n + done(s), 0),
    matchesTotal: statuses.reduce((n, s) => n + s.length, 0),
  }
}

/** Standings for one box, best first (ties: ladder-before position). */
export function boxStandings(box: SessionBox, ladderBefore: number[]) {
  // indexOf, as the old code did (-1 for anyone not on it).
  const rank = (id: number) => ladderBefore.indexOf(id)
  return computeStandings(
    {
      players: box.players.map((p) => p.id),
      matchSets: box.matches.map((m) => toSetScores(m.sets)),
    },
    ALL_SET_FORMATS,
    rank,
  )
}

/** The ladder after closing (player ids, best first): 2 up, 2 down. */
export function ladderAfter(session: Session): number[] {
  const before = session.leaderboardBefore.map((p) => p.id)
  const sorted = session.boxes.map((b) =>
    boxStandings(b, before).map((s) => s.player),
  )
  return applyMovement(before, sorted, '2up2down')
}

/** How many players move up and down between two ladders. */
export function movement(before: number[], after: number[]) {
  let up = 0
  let down = 0
  after.forEach((id, i) => {
    const was = before.indexOf(id)
    if (was === -1) return
    if (i < was) up++
    else if (i > was) down++
  })
  return { up, down }
}
