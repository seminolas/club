// A session's page. Comes in UI-PORT.md U4; meanwhile, the old UI.
import { Anchor, Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sessions/$date')({
  component: function SessionPage() {
    const { date } = Route.useParams()
    return (
      <Text>
        Session pages come next.{' '}
        <Anchor href={`/#/${date}`}>Open in the old version</Anchor>
      </Text>
    )
  },
})
