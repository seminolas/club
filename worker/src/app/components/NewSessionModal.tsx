// New session (admins): a date, defaulting to the open session's date or
// the club's next night, with the old UI's rules: one session per date, and the latest
// session must be closed first.
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SessionListRow } from '../../services/sessions'
import { createSessionFn } from '../fns/sessions'
import { INFO_TEXT } from '../lib/colors'
import { useClub } from '../lib/club'
import { nextNight } from '../lib/dates'
import { toastError } from '../lib/toasts'

export function NewSessionModal(props: {
  opened: boolean
  /** The club the session is for (its slug). */
  club: string
  sessions: SessionListRow[]
  onClose: () => void
  onCreated: (date: string) => void
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="New session"
      size="sm"
      centered
    >
      {props.opened && <NewSessionForm {...props} />}
    </Modal>
  )
}

function NewSessionForm(props: {
  club: string
  sessions: SessionListRow[]
  onClose: () => void
  onCreated: (date: string) => void
}) {
  const queryClient = useQueryClient()
  const { weekday } = useClub()
  const latest = props.sessions[0]
  const openOne = latest && latest.status !== 'closed' ? latest : null
  const [date, setDate] = useState(openOne?.date ?? nextNight(weekday))
  const exists = props.sessions.some((s) => s.date === date)
  const create = useMutation({
    mutationFn: () => createSessionFn({ data: { club: props.club, date } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      props.onCreated(date)
    },
    onError: toastError,
  })
  const blocked = openOne
    ? 'Close the current session first.'
    : exists
      ? 'Session already exists for this date.'
      : null

  return (
    <Stack gap="sm">
      <TextInput
        type="date"
        label="Date"
        value={date}
        onChange={(e) => setDate(e.currentTarget.value)}
        data-autofocus
      />
      {blocked && (
        <Text size="sm" c={INFO_TEXT}>
          {blocked}
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          disabled={!date || blocked !== null}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Create
        </Button>
      </Group>
    </Stack>
  )
}
