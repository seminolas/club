// Admin: a club's settings (MULTI-CLUB.md), as the player page: a card with
// Edit → fields → Save / Cancel. Its HelloClub series is picked from
// HelloClub's recurring series (read-only call), and the page shows the
// series' next event, so a link that's gone stale (a new junior term) shows.
import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  notFound,
  useParams,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Dash } from '../../components/list-helpers'
import { PageCard } from '../../components/PageCard'
import type { Crumbs } from '../../components/PageCrumbs'
import { updateClubFn } from '../../fns/clubs'
import { WEEKDAYS } from '../../lib/club'
import { INFO_TEXT } from '../../lib/colors'
import { adminClubsQuery, clubsQuery, hcSeriesQuery } from '../../lib/queries'
import { toastError, toastOk } from '../../lib/toasts'
import type { ClubChange, HcSeries } from '../../../services/clubs'

// Typed, as the route's own type depends on it.
function useCrumbs(): Crumbs {
  const { slug = '' }: { slug?: string } = useParams({ strict: false })
  const { data: clubs } = useSuspenseQuery(adminClubsQuery)
  return {
    parent: { label: 'Clubs', to: '/admin/clubs' },
    current: clubs.find((c) => c.slug === slug)?.label ?? slug,
  }
}

export const Route = createFileRoute('/admin/clubs/$slug')({
  loader: async ({ context, params }) => {
    const clubs = await context.queryClient.ensureQueryData(adminClubsQuery)
    if (!clubs.some((c) => c.slug === params.slug)) throw notFound()
  },
  staticData: { crumbs: useCrumbs },
  component: ClubPage,
})

interface Draft {
  label: string
  title: string
  weekday: string | null
}

/** "Thu 13 Nov, 4:00pm" in the club's (NZ) time. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

/** The weekday (0 Sunday … 6 Saturday) an event starts on, in NZ. */
const weekdayOf = (iso: string) =>
  WEEKDAYS.indexOf(
    new Date(iso).toLocaleDateString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long',
    }) as (typeof WEEKDAYS)[number],
  )

function ClubPage() {
  const { slug } = Route.useParams()
  const { data: clubs } = useSuspenseQuery(adminClubsQuery)
  const club = clubs.find((c) => c.slug === slug)!
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [linking, setLinking] = useState(false)

  const save = async (change: ClubChange, done: string) => {
    try {
      await updateClubFn({ data: { slug, change } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] }),
        queryClient.invalidateQueries({ queryKey: clubsQuery.queryKey }),
      ])
      toastOk(done)
      return true
    } catch (e) {
      toastError(e)
      return false
    }
  }
  const saveEdit = async () => {
    if (!draft) return
    const ok = await save(
      {
        label: draft.label,
        title: draft.title,
        weekday: draft.weekday === null ? undefined : Number(draft.weekday),
      },
      'Saved.',
    )
    if (ok) setDraft(null)
  }

  return (
    <Stack gap="sm">
      <PageCard
        title={club.label}
        actions={
          draft ? (
            <>
              <Button variant="default" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()}>Save</Button>
            </>
          ) : (
            <Button
              variant="default"
              onClick={() =>
                setDraft({
                  label: club.label,
                  title: club.title,
                  weekday: club.weekday === null ? null : String(club.weekday),
                })
              }
            >
              Edit
            </Button>
          )
        }
      />
      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <Row label="Name">
            {draft ? (
              <TextInput
                aria-label="Name"
                value={draft.label}
                onChange={(e) => {
                  const label = e.currentTarget.value
                  setDraft((d) => d && { ...d, label })
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <Text size="sm">{club.label}</Text>
            )}
          </Row>
          <Row label="Session title">
            {draft ? (
              <TextInput
                aria-label="Session title"
                description="E.g. “Tuesday Box”, as at the top of a session"
                value={draft.title}
                onChange={(e) => {
                  const title = e.currentTarget.value
                  setDraft((d) => d && { ...d, title })
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <Text size="sm">{club.title}</Text>
            )}
          </Row>
          <Row label="Address">
            <Text size="sm">/{club.slug}</Text>
          </Row>
          <Row label="Night">
            {draft ? (
              <Select
                aria-label="Night"
                data={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
                value={draft.weekday}
                onChange={(weekday) => setDraft((d) => d && { ...d, weekday })}
                allowDeselect={false}
                style={{ flex: 1 }}
              />
            ) : club.weekday === null ? (
              <Dash />
            ) : (
              <Text size="sm">{WEEKDAYS[club.weekday]}</Text>
            )}
          </Row>
          <Row label="HelloClub" align="flex-start">
            <SeriesValue
              series={club.hcSeries}
              weekday={club.weekday}
              onLink={draft ? undefined : () => setLinking(true)}
            />
          </Row>
          <Row label="Ladder">
            <Text size="sm">
              {club.players} {club.players === 1 ? 'player' : 'players'} ·{' '}
              <Anchor
                component={Link}
                // A plain path: Anchor's polymorphic props don't carry
                // route params.
                to={`/${club.slug}/players`}
                size="sm"
              >
                {club.players === 0
                  ? 'Import a ladder on its Players tab'
                  : 'Players tab'}
              </Anchor>
            </Text>
          </Row>
        </Stack>
      </Paper>
      <LinkSeriesModal
        opened={linking}
        current={club.hcSeries}
        weekday={club.weekday}
        onClose={() => setLinking(false)}
        onLink={async (series) => {
          const ok = await save(
            { hcSeries: series },
            series ? `Linked to ${series.name}.` : 'Unlinked.',
          )
          if (ok) setLinking(false)
        }}
      />
    </Stack>
  )
}

function Row(props: {
  label: string
  children: ReactNode
  align?: 'center' | 'flex-start'
}) {
  return (
    <Group gap="sm" wrap="nowrap" align={props.align ?? 'center'}>
      <Text size="sm" c={INFO_TEXT} w={104} style={{ flexShrink: 0 }}>
        {props.label}
      </Text>
      {props.children}
    </Group>
  )
}

/**
 * The linked series and its next event (from HelloClub), or why there's
 * none: not linked, no events coming (a past term), or HelloClub unreachable.
 */
function SeriesValue(props: {
  series: { id: string; name: string } | null
  weekday: number | null
  onLink?: () => void
}) {
  const live = useQuery({ ...hcSeriesQuery, enabled: props.series !== null })
  const next = live.data?.find((s) => s.id === props.series?.id)
  const button = props.onLink && (
    <Button size="xs" variant="default" onClick={props.onLink}>
      {props.series ? 'Change' : 'Link a series'}
    </Button>
  )
  if (!props.series)
    return (
      <Stack gap={6} style={{ flex: 1 }}>
        <Text size="sm" c={INFO_TEXT} fs="italic">
          Not linked: the sync looks for an event by name
        </Text>
        {button && <Group>{button}</Group>}
      </Stack>
    )
  return (
    <Stack gap={6} style={{ flex: 1 }}>
      <Text size="sm">{props.series.name}</Text>
      {live.isPending ? (
        <Text size="sm" c={INFO_TEXT}>
          Checking HelloClub…
        </Text>
      ) : live.isError ? (
        <Text size="sm" c={INFO_TEXT}>
          HelloClub couldn’t be reached to check its next event.
        </Text>
      ) : next ? (
        <Text size="sm" c={INFO_TEXT}>
          Next: {when(next.next)}
          {props.weekday !== null && weekdayOf(next.next) !== props.weekday
            ? ` (not on the club’s night, ${WEEKDAYS[props.weekday]})`
            : ''}
        </Text>
      ) : (
        <Alert color="yellow" p="xs">
          <Text size="sm">
            No events in the next six weeks. If a new term’s series has started,
            link it.
          </Text>
        </Alert>
      )}
      {button && <Group>{button}</Group>}
    </Stack>
  )
}

/** Pick one of HelloClub's recurring series; the club's night first. */
function LinkSeriesModal(props: {
  opened: boolean
  current: { id: string; name: string } | null
  weekday: number | null
  onClose: () => void
  onLink: (series: { id: string; name: string } | null) => Promise<void>
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Link a HelloClub series"
      centered
    >
      {props.opened && <LinkSeriesForm {...props} />}
    </Modal>
  )
}

function LinkSeriesForm(props: {
  current: { id: string; name: string } | null
  weekday: number | null
  onClose: () => void
  onLink: (series: { id: string; name: string } | null) => Promise<void>
}) {
  const series = useQuery(hcSeriesQuery)
  const [picked, setPicked] = useState<string | null>(props.current?.id ?? null)
  const [busy, setBusy] = useState(false)
  const onNight = (s: HcSeries) =>
    props.weekday !== null && weekdayOf(s.next) === props.weekday
  const label = (s: HcSeries) => `${s.name} · ${when(s.next)}`
  const all = series.data ?? []
  const data = [
    {
      group:
        props.weekday === null ? 'Series' : `On ${WEEKDAYS[props.weekday]}s`,
      items: all.filter(onNight).map((s) => ({ value: s.id, label: label(s) })),
    },
    {
      group: 'Other nights',
      items: all
        .filter((s) => !onNight(s))
        .map((s) => ({ value: s.id, label: label(s) })),
    },
  ].filter((g) => g.items.length > 0)
  const link = async (value: { id: string; name: string } | null) => {
    setBusy(true)
    await props.onLink(value)
    setBusy(false)
  }
  return (
    <Stack>
      <Text size="sm" c={INFO_TEXT}>
        The sync uses the series’ event on each session’s date. Junior series
        change each term: link the new one when it starts.
      </Text>
      {series.isError ? (
        <Alert color="red" p="xs">
          <Text size="sm">
            HelloClub couldn’t be reached: {String(series.error.message)}
          </Text>
        </Alert>
      ) : (
        <Select
          label="Series"
          placeholder={
            series.isPending ? 'Loading from HelloClub…' : 'Pick a series'
          }
          description="Recurring events in the hall over the next six weeks"
          data={data}
          value={picked}
          onChange={setPicked}
          searchable
          nothingFoundMessage="No series matches"
          disabled={series.isPending}
        />
      )}
      <Group justify="space-between">
        {props.current ? (
          <Button
            variant="subtle"
            color="red"
            loading={busy}
            onClick={() => void link(null)}
          >
            Unlink
          </Button>
        ) : (
          <span />
        )}
        <Group gap="xs">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked || picked === props.current?.id}
            loading={busy}
            onClick={() => {
              const s = all.find((x) => x.id === picked)
              if (s) void link({ id: s.id, name: s.name })
            }}
          >
            Link
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
