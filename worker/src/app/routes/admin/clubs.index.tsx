// Admin: the clubs (MULTI-CLUB.md: a club per ladder/night), with "New club".
// The same list as Players and Sessions (ListTable); View opens a club's
// settings.
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Dash, sessionDate } from '../../components/list-helpers'
import { ListTable } from '../../components/list-table/ListTable'
import type { Crumbs } from '../../components/PageCrumbs'
import { createClubFn } from '../../fns/clubs'
import { WEEKDAYS } from '../../lib/club'
import { INFO_TEXT } from '../../lib/colors'
import { adminClubsQuery, clubsQuery } from '../../lib/queries'
import { toastError, toastOk } from '../../lib/toasts'
import type { ClubSummary } from '../../../services/clubs'

// Typed, as the route's own type depends on it.
function useCrumbs(): Crumbs {
  return { current: 'Clubs' }
}

export const Route = createFileRoute('/admin/clubs/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminClubsQuery),
  staticData: { crumbs: useCrumbs },
  component: ClubsPage,
})

/** "Thursday", or a dash if the night isn't set. */
export function nightName(weekday: number | null) {
  return weekday === null ? <Dash /> : WEEKDAYS[weekday]
}

function ClubsPage() {
  const { data: clubs } = useSuspenseQuery(adminClubsQuery)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const view = (slug: string) =>
    void navigate({ to: '/admin/clubs/$slug', params: { slug } })
  return (
    <>
      <ListTable<ClubSummary>
        records={clubs}
        getKey={(c) => c.slug}
        noun={{ one: 'club', many: 'clubs' }}
        searchText={(c) => `${c.label} ${c.title} ${c.slug}`}
        searchPlaceholder="Find a club…"
        primaryColumn="label"
        hideColumnChooser
        primaryAction={(c) => ({ label: 'View', run: () => view(c.slug) })}
        title="Clubs"
        actions={<Button onClick={() => setCreating(true)}>New club</Button>}
        columns={[
          { accessor: 'label', title: 'Club', sortable: true },
          {
            accessor: 'weekday',
            title: 'Night',
            render: (c) => nightName(c.weekday),
          },
          {
            accessor: 'slug',
            title: 'Address',
            visibleMediaQuery: '(min-width: 36em)',
            render: (c) => `/${c.slug}`,
          },
          {
            accessor: 'players',
            title: 'Players',
            numeric: true,
            sortable: true,
          },
          {
            accessor: 'lastSession',
            title: 'Last session',
            visibleMediaQuery: '(min-width: 36em)',
            render: (c) =>
              c.lastSession ? sessionDate(c.lastSession) : <Dash />,
          },
        ]}
      />
      <NewClubModal
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={(slug) => {
          setCreating(false)
          view(slug)
        }}
      />
    </>
  )
}

/** "Juniors" → "juniors": a starting address the admin can change. */
const slugOf = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** What can't change later: name, address and night (the rest on its page). */
function NewClubModal(props: {
  opened: boolean
  onClose: () => void
  onCreated: (slug: string) => void
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="New club"
      size="sm"
      centered
    >
      {props.opened && <NewClubForm {...props} />}
    </Modal>
  )
}

function NewClubForm(props: {
  onClose: () => void
  onCreated: (slug: string) => void
}) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  // Follows the name until the admin edits it.
  const [slug, setSlug] = useState<string | null>(null)
  const [weekday, setWeekday] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const address = slug ?? slugOf(label)
  const create = async () => {
    setBusy(true)
    try {
      await createClubFn({
        data: { label, slug: address, weekday: Number(weekday) },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] }),
        queryClient.invalidateQueries({ queryKey: clubsQuery.queryKey }),
      ])
      toastOk(`Created ${label.trim()}.`)
      props.onCreated(address)
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack>
      <TextInput
        label="Name"
        placeholder="Juniors"
        value={label}
        onChange={(e) => setLabel(e.currentTarget.value)}
        data-autofocus
      />
      <TextInput
        label="Address"
        description="In the club’s links. It can’t be changed later."
        leftSection={<Text size="sm">/</Text>}
        value={address}
        onChange={(e) => setSlug(e.currentTarget.value)}
      />
      <Select
        label="Night"
        placeholder="The night it plays"
        data={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
        value={weekday}
        onChange={setWeekday}
        allowDeselect={false}
      />
      <Text size="sm" c={INFO_TEXT}>
        The session title and HelloClub series are set on the club’s page.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          disabled={!label.trim() || !address || weekday === null}
          loading={busy}
          onClick={() => void create()}
        >
          Create
        </Button>
      </Group>
    </Stack>
  )
}
