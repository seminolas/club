// The night in numbers, above the Results table: stat cards and the night's
// records (the lab's Sessions-tab cards, club-next temp/stats-experiments,
// without estimated calories). Mantine's StatsGrid pattern (ui.mantine.dev),
// on the tint of the cards around them (ListTable.css, --lt-toolbar-bg).
import { Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { sessionStats } from '../../lib/sessionStats'
import type { Pairs } from '../../lib/sessionStats'
import type { Session } from '../../lib/session'

function Stat(props: { label: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" px="sm" py="xs" bg="var(--lt-toolbar-bg)">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
        {props.label}
      </Text>
      {props.children}
    </Paper>
  )
}

const Value = (props: { children: ReactNode }) => (
  <Text
    fz={24}
    fw={700}
    lh={1.2}
    style={{ fontVariantNumeric: 'tabular-nums' }}
  >
    {props.children}
  </Text>
)

const Detail = (props: { children: ReactNode }) => (
  <Text size="sm" c="dimmed">
    {props.children}
  </Text>
)

export function SessionStats(props: {
  session: Session
  /** Short name by player id. */
  name: (id: number) => string
}) {
  const s = sessionStats(props.session)
  const vs = ([a, b]: Pairs) =>
    `${a.map(props.name).join(' & ')} vs ${b.map(props.name).join(' & ')}`
  const n = (x: number) => x.toLocaleString('en-NZ')
  // One-line labels; six cards fill even rows at every width.
  const stats: [string, ReactNode, ReactNode?][] = [
    ['Players', n(s.players)],
    ['Boxes', n(s.boxes)],
    ['Matches', n(s.matches), `${n(s.threeGameMatches)} went to 3 games`],
    ['Total games', n(s.games)],
    ['Total points', n(s.points)],
    ['Avg margin', s.avgMargin === null ? '–' : s.avgMargin.toFixed(1)],
  ]
  const { closestGame: close, biggestBlowout: blowout } = s
  const high = s.highestScoringMatch

  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 2, xs: 3, md: 6 }} spacing="xs">
        {stats.map(([label, value, detail]) => (
          <Stat key={label} label={label}>
            <Value>{value}</Value>
            {detail && <Detail>{detail}</Detail>}
          </Stat>
        ))}
      </SimpleGrid>
      {(close || blowout || high) && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
          {[
            ['Closest game', close] as const,
            ['Biggest blowout', blowout] as const,
          ].map(
            ([label, g]) =>
              g && (
                <Stat key={label} label={label}>
                  <Value>{g.score.join('–')}</Value>
                  <Detail>{vs(g.pairs)}</Detail>
                  <Detail>
                    Box {g.box} · Game {g.game}
                  </Detail>
                </Stat>
              ),
          )}
          {high && (
            <Stat label="Highest-scoring match">
              <Value>{n(high.points)} points</Value>
              <Detail>{vs(high.pairs)}</Detail>
              <Detail>
                Box {high.box} ·{' '}
                {high.scores.map((g) => g.join('–')).join(', ')}
              </Detail>
            </Stat>
          )}
        </SimpleGrid>
      )}
    </Stack>
  )
}
