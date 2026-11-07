// The header (UI-PORT.md, App shell): home (a house) and the club menu
// ("Seniors ▾", MULTI-CLUB.md) and, on a detail
// page, its breadcrumb after it (PageCrumbs), the day/night switch
// (for everyone, signed in or not), and the user menu ("Signed in as <first
// name>", Sign out) or "Sign in". The decision for S5 (V1): Mantine Avatar +
// Menu.
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { IconCheck, IconChevronDown, IconHome } from '@tabler/icons-react'
import {
  Link,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import type { Viewer } from '../../services/viewer'
import { ColorSchemeToggle } from './ColorSchemeToggle'
import { DEFAULT_CLUB, WEEKDAYS, rememberedClub } from '../lib/club'
import { clubsQuery } from '../lib/queries'
import { PageCrumbs } from './PageCrumbs'

export function AppHeader(props: {
  viewer: Viewer
  onSignIn: () => void
  onSignOut: () => void
}) {
  const { viewer } = props
  const fullName = viewer.player?.name ?? viewer.name ?? ''
  const first = fullName.trim().split(/\s+/)[0]
  // The page's club; outside a club's pages (admin), this device's last.
  const club = useHeaderClub()
  // The deepest route with a breadcrumb trail (detail pages); none on the
  // landing pages.
  const trail = useMatches({
    select: (ms) => {
      const m = [...ms].reverse().find((x) => x.staticData.crumbs)
      return m?.staticData.crumbs
        ? { routeId: m.routeId, use: m.staticData.crumbs }
        : undefined
    },
  })
  // Home (the house, to the club's landing page) and the club menu; in a
  // trail on phones, the house alone.
  const home = (inTrail: boolean) => (
    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Anchor
        component={Link}
        // A plain path: Anchor's polymorphic props don't carry route params.
        to={`/${club}/players`}
        c="var(--mantine-color-text)"
        underline="never"
        aria-label="Northland Badminton, home"
        title="Northland Badminton"
        style={{ display: 'flex' }}
      >
        <IconHome size={20} stroke={2} />
      </Anchor>
      <Box visibleFrom={inTrail ? 'xs' : undefined}>
        <ClubMenu slug={club} />
      </Box>
    </Group>
  )
  return (
    <Container size="md" h="100%" px="md">
      <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
        {trail ? (
          <PageCrumbs
            // A new hook per page: remount rather than change hooks.
            key={trail.routeId}
            home={home(true)}
            use={trail.use}
          />
        ) : (
          home(false)
        )}
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          <ColorSchemeToggle />
          {viewer.signedIn ? (
            <Menu position="bottom-end" width={240} shadow="md">
              <Menu.Target>
                <UnstyledButton data-test="user-menu" aria-label="Account menu">
                  <Group gap={6} wrap="nowrap">
                    <Avatar size={28} color="teal" name={fullName} />
                    <Text size="sm" data-test="signed-in-as">
                      <Text span visibleFrom="xs" inherit>
                        Signed in as{' '}
                      </Text>
                      {first}
                    </Text>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Group gap={6} justify="space-between" wrap="nowrap">
                    <Text
                      size="sm"
                      fw={600}
                      c="var(--mantine-color-text)"
                      truncate
                    >
                      {fullName}
                    </Text>
                    {viewer.isAdmin && (
                      <Badge size="sm" variant="light" tt="none">
                        Admin
                      </Badge>
                    )}
                  </Group>
                </Menu.Label>
                <Menu.Divider />
                {viewer.isAdmin && (
                  // Admin pages, outside any club (/admin/…).
                  <Menu.Item component={Link} to="/admin/clubs">
                    Clubs
                  </Menu.Item>
                )}
                <Menu.Item onClick={props.onSignOut}>Sign out</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Button variant="default" size="xs" onClick={props.onSignIn}>
              Sign in
            </Button>
          )}
        </Group>
      </Group>
    </Container>
  )
}

/** The page's club, or (outside a club's pages) this device's last one. */
function useHeaderClub() {
  const { club }: { club?: string } = useParams({ strict: false })
  return club ?? rememberedClub() ?? DEFAULT_CLUB
}

/**
 * The club's name; with more than one club, a menu to switch (MULTI-CLUB.md):
 * each club and its night. Switching keeps the landing tab (Players or
 * Sessions); from any other page, it opens the club's Players.
 */
function ClubMenu(props: { slug: string }) {
  const { data: clubs = [] } = useQuery(clubsQuery)
  const pathname = useLocation({ select: (l) => l.pathname })
  const navigate = useNavigate()
  const label = clubs.find((c) => c.slug === props.slug)?.label ?? props.slug
  if (clubs.length < 2)
    return (
      <Text fw={700} data-test="club-name">
        {label}
      </Text>
    )
  const tab = pathname.endsWith(`/${props.slug}/sessions`)
    ? '/$club/sessions'
    : '/$club/players'
  return (
    <Menu position="bottom-start" shadow="md" width={220}>
      <Menu.Target>
        <UnstyledButton data-test="club-menu" aria-label={`Club: ${label}`}>
          <Group gap={4} wrap="nowrap">
            <Text fw={700}>{label}</Text>
            <IconChevronDown size={14} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Club</Menu.Label>
        {clubs.map((c) => (
          <Menu.Item
            key={c.slug}
            aria-current={c.slug === props.slug ? 'page' : undefined}
            leftSection={
              c.slug === props.slug ? <IconCheck size={16} /> : <Box w={16} />
            }
            rightSection={
              c.weekday !== null && (
                <Text size="xs" c="dimmed">
                  {WEEKDAYS[c.weekday]}
                </Text>
              )
            }
            onClick={() => void navigate({ to: tab, params: { club: c.slug } })}
          >
            {c.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
