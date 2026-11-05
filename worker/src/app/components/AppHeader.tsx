// The header (UI-PORT.md, App shell): home (a house and "NBA") and, on a detail
// page, its breadcrumb after it (PageCrumbs), the day/night switch
// (for everyone, signed in or not), and the user menu ("Signed in as <first
// name>", Sign out) or "Sign in". The decision for S5 (V1): Mantine Avatar +
// Menu.
import {
  Anchor,
  Avatar,
  Badge,
  Button,
  Container,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconChevronDown, IconHome } from '@tabler/icons-react'
import { Link, useMatches } from '@tanstack/react-router'
import type { Viewer } from '../../services/viewer'
import { ColorSchemeToggle } from './ColorSchemeToggle'
import { useClubSlug } from '../lib/club'
import { PageCrumbs } from './PageCrumbs'

export function AppHeader(props: {
  viewer: Viewer
  onSignIn: () => void
  onSignOut: () => void
}) {
  const { viewer } = props
  const fullName = viewer.player?.name ?? viewer.name ?? ''
  const first = fullName.trim().split(/\s+/)[0]
  // Home is the page's club's landing page.
  const club = useClubSlug()
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
  // Home: the house and "NBA"; in a trail on phones, the house alone.
  const home = (inTrail: boolean) => (
    <Anchor
      component={Link}
      // A plain path: Anchor's polymorphic props don't carry route params.
      to={`/${club}/players`}
      fw={700}
      c="var(--mantine-color-text)"
      underline="never"
      // Short, to leave room for a club selector later.
      aria-label="Northland Badminton, home"
      title="Northland Badminton"
      style={{ flexShrink: 0 }}
    >
      <Group component="span" gap={6} wrap="nowrap">
        <IconHome size={20} stroke={2} />
        <Text span inherit visibleFrom={inTrail ? 'xs' : undefined}>
          NBA
        </Text>
      </Group>
    </Anchor>
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
