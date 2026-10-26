// "How rankings work": the ladder position (decides boxes) and Skill (a
// statistical estimate; domain/skill.ts), explained in plain words.
import { Button, Modal, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

export function RankingsHelp() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        How rankings work
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="How rankings work"
        centered
      >
        <Stack gap="md">
          <div>
            <Title order={5} mb={4}>
              Ladder position (#)
            </Title>
            <Text size="sm">
              Your place on the ladder decides your box: boxes are made from the
              players who came, in ladder order. After each night, the top two
              in each box move up a box and the bottom two move down, swapping
              places with the players they pass. If you don’t come, you keep
              your place.
            </Text>
          </div>
          <div>
            <Title order={5} mb={4}>
              Skill
            </Title>
            <Text size="sm">
              A statistical estimate of how strong a player you are, worked out
              from all your game scores over the past year: who you partnered,
              who you played, and by how much you won or lost each game. It’s
              the ranking that best explains everyone’s results, and it’s
              updated each time a night is closed.
            </Text>
            <Text size="sm" mt="xs">
              Skill doesn’t decide boxes. Older results count a little less, and
              with only a few games your Skill is a rough guess that settles as
              you play more.
            </Text>
          </div>
        </Stack>
      </Modal>
    </>
  )
}
