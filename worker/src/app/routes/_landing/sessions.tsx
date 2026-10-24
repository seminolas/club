import { Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_landing/sessions')({
  component: () => (
    <Text c="gray.7">The sessions list comes here (UI-PORT.md, U2).</Text>
  ),
})
