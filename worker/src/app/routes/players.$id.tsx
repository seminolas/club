// A player's page, admins only (old UI: "Player view"; no lab design, so in
// the new UI's style): profile, Edit, Find in HelloClub, sign-in link, Remove.
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { IconChevronLeft, IconDots } from '@tabler/icons-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  HcMember,
  ProfileChange,
  playerProfile,
} from '../../services/players'
import { PageCard } from '../components/PageCard'
import {
  removePlayerFn,
  searchHcFn,
  unlinkPlayerFn,
  updatePlayerFn,
} from '../fns/players'
import { INFO_TEXT } from '../lib/colors'
import { playerQuery, viewerQuery } from '../lib/queries'
import { confirmAction, toastError, toastOk } from '../lib/toasts'

export const Route = createFileRoute('/players/$id')({
  beforeLoad: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(viewerQuery)
    if (!viewer.isAdmin) throw redirect({ to: '/players' })
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(playerQuery(Number(params.id))),
  component: PlayerPage,
})

type Profile = Awaited<ReturnType<typeof playerProfile>>

function PlayerPage() {
  const id = Number(Route.useParams().id)
  const { data: player } = useSuspenseQuery(playerQuery(id))
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Required<ProfileChange> | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['player', id] }),
      queryClient.invalidateQueries({ queryKey: ['ladder'] }),
    ])
  const save = async (fields: ProfileChange, done: string) => {
    try {
      await updatePlayerFn({ data: { id, fields } })
      await refresh()
      toastOk(done)
      return true
    } catch (e) {
      toastError(e)
      return false
    }
  }

  const startEdit = () =>
    setDraft({
      name: player.name,
      email: player.email ?? '',
      hc_member_id: player.hc_member_id ?? '',
      preferred_name: player.preferred_name ?? '',
    })
  const saveEdit = async () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return toastError(new Error('Name cannot be empty.'))
    const blank = (v: string | null) => v?.trim() || null
    const ok = await save(
      {
        name,
        email: blank(draft.email),
        hc_member_id: blank(draft.hc_member_id),
        preferred_name: blank(draft.preferred_name),
      },
      'Profile saved.',
    )
    if (ok) setDraft(null)
  }
  const remove = () =>
    confirmAction({
      title: 'Remove player?',
      message: `Remove “${player.name}” permanently? This cannot be undone.`,
      confirmLabel: 'Remove player',
      danger: true,
      onConfirm: async () => {
        try {
          await removePlayerFn({ data: id })
          await queryClient.invalidateQueries({ queryKey: ['ladder'] })
          toastOk(`${player.name} removed.`)
          void navigate({ to: '/players' })
        } catch (e) {
          toastError(e)
        }
      },
    })
  const unlink = () =>
    player.login &&
    confirmAction({
      title: 'Unlink sign-in?',
      message: `Unlink ${player.name} from the Google account ${player.login.email}? They can link again by signing in.`,
      confirmLabel: 'Unlink',
      danger: true,
      onConfirm: async () => {
        try {
          await unlinkPlayerFn({ data: id })
          await refresh()
          toastOk('Sign-in unlinked.')
        } catch (e) {
          toastError(e)
        }
      },
    })

  const field = (
    key: keyof ProfileChange,
    label: string,
    shown: ReactNode,
    placeholder?: string,
  ) => (
    <Row label={label}>
      {draft ? (
        <TextInput
          aria-label={label}
          value={draft[key] ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            const value = e.currentTarget.value
            setDraft((d) => d && { ...d, [key]: value })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveEdit()
            if (e.key === 'Escape') setDraft(null)
          }}
          style={{ flex: 1 }}
        />
      ) : (
        shown
      )}
    </Row>
  )

  return (
    <Stack gap="sm">
      <Anchor component={Link} to="/players" size="sm">
        <Group gap={2} component="span">
          <IconChevronLeft size={14} /> Players
        </Group>
      </Anchor>
      <PageCard
        title={player.name}
        actions={
          draft ? (
            <>
              <Button variant="default" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()}>Save</Button>
            </>
          ) : (
            <>
              <Button variant="default" onClick={startEdit}>
                Edit
              </Button>
              <Button variant="default" onClick={() => setFindOpen(true)}>
                Find in HelloClub
              </Button>
              {/* What deletes goes in "…", red and confirmed (as on the
                  session card). */}
              <Menu position="bottom-end" width={240}>
                <Menu.Target>
                  <ActionIcon
                    size={36}
                    variant="default"
                    aria-label="More player actions"
                  >
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item color="red" onClick={remove}>
                    <Text size="sm" fw={600} inherit>
                      Remove player…
                    </Text>
                    <Text size="xs" c={INFO_TEXT}>
                      Only possible before they’ve played
                    </Text>
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )
        }
      />
      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          {field('name', 'Name', <Text size="sm">{player.name}</Text>)}
          {field(
            'email',
            'Email',
            <Value text={player.email} />,
            'email@example.com',
          )}
          {field(
            'preferred_name',
            'Display name',
            <Value text={player.preferred_name} />,
            'Short name used in boxes (blank to use first name)',
          )}
          {field(
            'hc_member_id',
            'HelloClub',
            player.hc_member_id ? (
              <Group gap="xs">
                <Text size="sm" ff="monospace">
                  {player.hc_member_id}
                </Text>
                <Badge size="sm" variant="light" tt="none">
                  Linked
                </Badge>
              </Group>
            ) : (
              <Value text={null} />
            ),
            'HelloClub member ID (blank to unlink)',
          )}
          <Row label="Sign-in">
            {player.login ? (
              <Group gap="xs" justify="space-between" style={{ flex: 1 }}>
                <Text size="sm" truncate>
                  Google: {player.login.email}
                </Text>
                {!draft && (
                  <Button size="xs" variant="default" onClick={unlink}>
                    Unlink
                  </Button>
                )}
              </Group>
            ) : (
              <Value text={null} empty="Not linked" />
            )}
          </Row>
        </Stack>
      </Paper>
      <FindInHelloClub
        opened={findOpen}
        player={player}
        onClose={() => setFindOpen(false)}
        onLink={async (m, extra) => {
          const ok = await save(
            { hc_member_id: m.id, ...extra },
            `Linked to ${m.name}.`,
          )
          if (ok) setFindOpen(false)
        }}
      />
    </Stack>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Text size="sm" c={INFO_TEXT} w={96} style={{ flexShrink: 0 }}>
        {props.label}
      </Text>
      {props.children}
    </Group>
  )
}

function Value(props: { text: string | null; empty?: string }) {
  return props.text ? (
    <Text size="sm">{props.text}</Text>
  ) : (
    <Text size="sm" c={INFO_TEXT} fs="italic">
      {props.empty ?? 'Not set'}
    </Text>
  )
}

/** Search HelloClub's members and link one; offers its name and email. */
function FindInHelloClub(props: {
  opened: boolean
  player: Profile
  onClose: () => void
  onLink: (m: HcMember, extra: ProfileChange) => Promise<void>
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Find in HelloClub"
      centered
    >
      {props.opened && <FindForm {...props} />}
    </Modal>
  )
}

function FindForm(props: {
  player: Profile
  onLink: (m: HcMember, extra: ProfileChange) => Promise<void>
}) {
  const [query, setQuery] = useState(props.player.name)
  const [debounced] = useDebouncedValue(query.trim(), 400)
  const results = useQuery({
    queryKey: ['hc-members', debounced],
    queryFn: () => searchHcFn({ data: debounced }),
    enabled: debounced !== '',
  })
  const [picked, setPicked] = useState<HcMember | null>(null)
  const [update, setUpdate] = useState({ name: true, email: true })

  if (picked) {
    const nameDiffers = picked.name.trim() !== props.player.name.trim()
    const emailDiffers =
      !!picked.email &&
      picked.email.trim() !== (props.player.email ?? '').trim()
    return (
      <Stack gap="sm">
        <Text size="sm" c={INFO_TEXT}>
          {picked.name}
          {picked.number && ` (#${picked.number})`}
        </Text>
        {nameDiffers && (
          <Checkbox
            checked={update.name}
            onChange={(e) =>
              setUpdate((u) => ({ ...u, name: e.currentTarget.checked }))
            }
            label={
              <>
                Update name: <s>{props.player.name}</s> → <b>{picked.name}</b>
              </>
            }
          />
        )}
        {emailDiffers && (
          <Checkbox
            checked={update.email}
            onChange={(e) =>
              setUpdate((u) => ({ ...u, email: e.currentTarget.checked }))
            }
            label={
              <>
                Update email: <s>{props.player.email || '(none)'}</s> →{' '}
                <b>{picked.email}</b>
              </>
            }
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPicked(null)}>
            Back
          </Button>
          <Button
            onClick={() =>
              void props.onLink(picked, {
                ...(nameDiffers && update.name ? { name: picked.name } : {}),
                ...(emailDiffers && update.email
                  ? { email: picked.email }
                  : {}),
              })
            }
          >
            Link
          </Button>
        </Group>
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <TextInput
        type="search"
        aria-label="Search by name"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        data-autofocus
      />
      <ScrollArea.Autosize mah="50vh">
        {results.isFetching && (
          <Text size="sm" c={INFO_TEXT} ta="center" py="md">
            Searching…
          </Text>
        )}
        {results.error && (
          <Text size="sm" c="red">
            {results.error.message}
          </Text>
        )}
        {!results.isFetching && results.data?.length === 0 && (
          <Text size="sm" c={INFO_TEXT} ta="center" py="md">
            No active members found.
          </Text>
        )}
        <Stack gap={0}>
          {results.data?.map((m) => (
            <Group
              key={m.id}
              justify="space-between"
              wrap="nowrap"
              py="xs"
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>
                  {m.name}
                </Text>
                <Text size="xs" c={INFO_TEXT} truncate>
                  {[m.number && `#${m.number}`, m.email]
                    .filter(Boolean)
                    .join('  ')}
                </Text>
              </div>
              <Button
                size="xs"
                onClick={() => {
                  const nameDiffers = m.name.trim() !== props.player.name.trim()
                  const emailDiffers =
                    !!m.email &&
                    m.email.trim() !== (props.player.email ?? '').trim()
                  if (!nameDiffers && !emailDiffers) void props.onLink(m, {})
                  else setPicked(m)
                }}
              >
                Select
              </Button>
            </Group>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  )
}
