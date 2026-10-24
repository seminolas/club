// A page's actions card, looking like ListTable's (title left, word buttons
// right; they wrap under the title on phones), for pages without a table.
import { Group, Paper, Text } from '@mantine/core'
import type { ReactNode } from 'react'

export function PageCard(props: { title: ReactNode; actions?: ReactNode }) {
  return (
    <Paper withBorder radius="md" px="sm" py="xs" className="club-page-card">
      <Group justify="space-between" gap="sm" mih={36}>
        {typeof props.title === 'string' ? (
          <Text fw={600}>{props.title}</Text>
        ) : (
          props.title
        )}
        {props.actions && <Group gap="xs">{props.actions}</Group>}
      </Group>
    </Paper>
  )
}
