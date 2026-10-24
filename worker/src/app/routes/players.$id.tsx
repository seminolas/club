// A player's page (admins). Comes in UI-PORT.md U3; meanwhile, the old UI.
import { Anchor, Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/players/$id')({
  component: function PlayerPage() {
    const { id } = Route.useParams()
    return (
      <Text>
        Player pages come next.{' '}
        <Anchor href={`/#/players/${id}`}>Open in the old version</Anchor>
      </Text>
    )
  },
})
