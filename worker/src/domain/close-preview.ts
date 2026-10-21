import { applyMovement } from './ladder'
import type { LadderRule } from './ladder'
import type { SetFormats, SetScore } from './scoring'
import { computeStandings } from './standings'

export interface ClosableView {
  ladder: number[]
  club: { setFormats: SetFormats; ladderRule: LadderRule }
  boxes: { players: { personId: number }[]; matches: { sets: SetScore[] }[] }[]
}

/** Ladder-after for a session (used at close, and for the confirm preview). */
export function computeLadderAfter(
  view: ClosableView,
  newcomers: number[],
): number[] {
  const rank = new Map(view.ladder.map((p, i) => [p, i]))
  const sorted = view.boxes.map((b) =>
    computeStandings(
      {
        players: b.players.map((p) => p.personId),
        matchSets: b.matches.map((m) => m.sets),
      },
      view.club.setFormats,
      (p) => rank.get(p) ?? Number.MAX_SAFE_INTEGER,
    ).map((st) => st.player),
  )
  return applyMovement(view.ladder, sorted, view.club.ladderRule, newcomers)
}
