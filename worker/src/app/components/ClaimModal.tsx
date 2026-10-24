// "Which player are you?" (V1): a signed-in login with no player picks
// themselves. It can't be skipped, only signed out of (decision 2026-10-23).
import {
  Button,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { claimPlayerFn } from '../fns/viewer'
import { claimableQuery, viewerQuery } from '../lib/queries'
import { INFO_TEXT } from '../lib/colors'
import { toastOk } from '../lib/toasts'
import classes from './ClaimModal.module.css'

export function ClaimModal(props: { opened: boolean; onSignOut: () => void }) {
  const queryClient = useQueryClient()
  const players = useQuery({ ...claimableQuery, enabled: props.opened })
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const claim = useMutation({
    mutationFn: (id: number) => claimPlayerFn({ data: id }),
    onSuccess: async (player) => {
      await queryClient.invalidateQueries({ queryKey: viewerQuery.queryKey })
      if (player) toastOk(`Signed in as ${player.name}.`)
    },
    onError: () => {
      setSelected(null)
      void players.refetch()
    },
  })
  const q = search.trim().toLowerCase()
  const matches = (players.data ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q),
  )

  return (
    <Modal
      opened={props.opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="Which player are you?"
      size="sm"
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c={INFO_TEXT}>
          We couldn’t match your Google account to a player. Find yourself and
          tap your name.
        </Text>
        <TextInput
          type="search"
          placeholder="Search names"
          aria-label="Search names"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-autofocus
        />
        <ScrollArea.Autosize mah="40vh" className={classes.list}>
          {matches.map((p) => (
            <UnstyledButton
              key={p.id}
              className={classes.row}
              data-selected={selected === p.id || undefined}
              aria-pressed={selected === p.id}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
            </UnstyledButton>
          ))}
          {players.isSuccess && matches.length === 0 && (
            <Text size="sm" c={INFO_TEXT} p="xs">
              No one by that name.
            </Text>
          )}
        </ScrollArea.Autosize>
        {(claim.error ?? players.error) && (
          <Text size="sm" c="red">
            {(claim.error ?? players.error)?.message}
          </Text>
        )}
        <Button
          disabled={selected === null}
          loading={claim.isPending}
          onClick={() => selected !== null && claim.mutate(selected)}
        >
          This is me
        </Button>
        <Text size="sm" c={INFO_TEXT} ta="center">
          New here? For now, an admin needs to add you.
        </Text>
        <Button variant="subtle" color="gray" onClick={props.onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Modal>
  )
}
