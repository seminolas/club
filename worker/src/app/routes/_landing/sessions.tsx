import { Text } from '@mantine/core'
import { INFO_TEXT } from '../../lib/colors'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_landing/sessions')({
  component: () => (
    <Text c={INFO_TEXT}>The sessions list comes here (UI-PORT.md, U2).</Text>
  ),
})
