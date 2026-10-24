import { Text } from '@mantine/core'
import { INFO_TEXT } from '../../lib/colors'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_landing/players')({
  component: () => (
    <Text c={INFO_TEXT}>The ladder comes here (UI-PORT.md, U2).</Text>
  ),
})
