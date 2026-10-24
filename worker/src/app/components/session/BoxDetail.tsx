// A box's matches and score entry, as the Boxes table's detail panel
// (club-table-lab GamesDetail, from the old UI's "Digital score entry"). Each
// match is a card like the printed score sheets: a "Match N" pill top-left,
// the status top-right, "Sitting out" bottom-right. Terminology: a box plays
// matches; a match is best of 3 games (the domain says "sets").
import { Badge, Table, Text, TextInput } from '@mantine/core'
import { IconClock } from '@tabler/icons-react'
import { getSitOut } from '../../../domain/pairings'
import {
  ALL_SET_FORMATS,
  evaluateMatch,
  isValidSet,
} from '../../../domain/scoring'
import type { MatchStatus, SetScore } from '../../../domain/scoring'
import { showThirdSet } from '../../lib/scoreSheet'
import { boxStandings, toSetScores } from '../../lib/session'
import type { SessionBox } from '../../lib/session'
import { Delta } from '../list-table/cells'
import './BoxDetail.css'

/** Colour of one score field: green for the game's winner, red otherwise. */
function fieldTone(s: SetScore | undefined, side: 0 | 1) {
  if (!s || s[0] === null || s[1] === null) return undefined
  if (!isValidSet(s[0], s[1], ALL_SET_FORMATS)) return 'bad'
  return (side === 0 ? s[0] > s[1] : s[1] > s[0]) ? 'win' : 'lose'
}

const STATUS: Record<
  MatchStatus,
  { icon: string; label: string; tone: string }
> = {
  not_started: { icon: 'clock', label: 'Not started', tone: 'wait' },
  in_progress: { icon: 'clock', label: 'In progress', tone: 'wait' },
  complete: { icon: '✓', label: 'Finished', tone: 'win' },
  invalid: { icon: '✗', label: 'Check scores', tone: 'bad' },
}

/** Enter / the keyboard's Next key moves to the next score field. */
function nextField(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const panel = e.currentTarget.closest('.gs-box')
  const fields = [
    ...(panel?.querySelectorAll<HTMLInputElement>('[data-score]') ?? []),
  ]
  fields[fields.indexOf(e.currentTarget) + 1]?.focus()
}

export function BoxDetail(props: {
  box: SessionBox
  /** Display name per player id (the score sheets' rule). */
  label: (id: number) => string
  /** Ladder before, for the standings' tie-break. */
  ladderBefore: number[]
  /** Scores can be typed (admins: any box; a player: their own box). */
  editable: boolean
  onScore: (
    match: number,
    game: number,
    side: 0 | 1,
    value: number | null,
  ) => void
}) {
  const { box } = props
  const size = box.players.length
  const name = (pos: number) => props.label(box.players[pos].id)
  const pairName = (pair: readonly number[]) => pair.map(name).join(' & ')
  const anyScore = box.matches.some((m) => m.sets.length > 0)

  return (
    <div className="gs-box">
      <div className="gs-cards">
        {box.matches.map((match, mi) => {
          const games = toSetScores(match.sets)
          const result = evaluateMatch(games, ALL_SET_FORMATS)
          const status = STATUS[result.status]
          const sitOut = getSitOut(size, mi)
          const won = (side: 1 | 2) =>
            result.status === 'complete'
              ? result.winner === side
                ? 'win'
                : 'lose'
              : undefined
          const lines = showThirdSet(games) || games.length > 2 ? 3 : 2
          return (
            <div
              key={mi}
              className="gs-match"
              data-sitout={sitOut.length > 0 || undefined}
            >
              <Badge className="gs-pill-match" color="gray.7" size="sm" fz={12}>
                Match {mi + 1}
              </Badge>
              <Text
                className="gs-status"
                data-tone={status.tone}
                aria-label={`Match ${mi + 1}: ${status.label}`}
                title={status.label}
              >
                {status.icon === 'clock' ? (
                  <IconClock size={22} stroke={2.2} />
                ) : (
                  status.icon
                )}
              </Text>
              <div className="gs-line">
                <Text size="sm" fw={600} className="gs-left" data-tone={won(1)}>
                  {pairName(match.pair1)}
                </Text>
                <Text size="xs" c="dimmed" className="gs-mid">
                  vs
                </Text>
                <Text size="sm" fw={600} data-tone={won(2)}>
                  {pairName(match.pair2)}
                </Text>
              </div>
              {Array.from({ length: lines }, (_, gi) => {
                const g = games[gi] as SetScore | undefined
                const field = (side: 0 | 1) => (
                  <TextInput
                    data-score
                    data-empty={g?.[side] == null || undefined}
                    data-tone={fieldTone(g, side)}
                    className="gs-field"
                    aria-label={`Match ${mi + 1}, game ${gi + 1}, ${pairName(side === 0 ? match.pair1 : match.pair2)}`}
                    inputMode="numeric"
                    enterKeyHint="next"
                    autoComplete="off"
                    readOnly={!props.editable}
                    value={g?.[side] ?? ''}
                    onChange={(e) => {
                      const digits = e.currentTarget.value
                        .replace(/\D/g, '')
                        .slice(0, 2)
                      props.onScore(
                        mi,
                        gi,
                        side,
                        digits === '' ? null : Number(digits),
                      )
                    }}
                    onKeyDown={nextField}
                  />
                )
                return (
                  <div key={gi} className="gs-line">
                    <div className="gs-left gs-game">
                      <Text size="xs" c="var(--club-info-text)">
                        Game {gi + 1}
                      </Text>
                      {field(0)}
                    </div>
                    <Text c="dimmed" className="gs-mid">
                      –
                    </Text>
                    {field(1)}
                  </div>
                )
              })}
              {sitOut.length > 0 && (
                <Badge
                  className="gs-pill-sitout"
                  variant="outline"
                  color="gray"
                  size="sm"
                  fz={12}
                  tt="none"
                >
                  Sitting out: {sitOut.map(name).join(', ')}
                </Badge>
              )}
            </div>
          )
        })}
      </div>
      {anyScore && <Standings {...props} />}
    </div>
  )
}

function Standings(props: {
  box: SessionBox
  label: (id: number) => string
  ladderBefore: number[]
}) {
  const standings = boxStandings(props.box, props.ladderBefore)
  return (
    // A card of its own, with a pill like the match cards, so the totals
    // don't run into the next box's row.
    <div className="gs-standings-card">
      <Badge className="gs-pill-match" color="gray.7" size="sm" fz={12}>
        Standings
      </Badge>
      <Table
        verticalSpacing={4}
        className="gs-standings"
        aria-label="Box standings"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={32}>#</Table.Th>
            <Table.Th>Player</Table.Th>
            {/* Matches won, then games and points won minus lost. */}
            <Table.Th ta="right">Won</Table.Th>
            <Table.Th ta="right">Games</Table.Th>
            <Table.Th ta="right">Points</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {standings.map((s) => (
            <Table.Tr key={s.player}>
              <Table.Td>{s.placing}.</Table.Td>
              <Table.Td>{props.label(s.player)}</Table.Td>
              <Table.Td ta="right">{s.gamesWon}</Table.Td>
              <Table.Td ta="right">
                <Delta value={s.setsWon - s.setsLost} />
              </Table.Td>
              <Table.Td ta="right">
                <Delta value={s.pointsFor - s.pointsAgainst} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  )
}
