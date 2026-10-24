import { Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_landing/players')({
  component: () => (
    <Text c="gray.7">The ladder comes here (UI-PORT.md, U2).</Text>
  ),
})
