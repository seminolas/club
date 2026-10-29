// The header (UI-PORT.md, App shell): home (a house and "NBA"), the day/night switch
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
import { Link } from '@tanstack/react-router'
import type { Viewer } from '../../services/viewer'
import { ColorSchemeToggle } from './ColorSchemeToggle'

export function AppHeader(props: {
  viewer: Viewer
  onSignIn: () => void
  onSignOut: () => void
}) {
  const { viewer } = props
  const fullName = viewer.player?.name ?? viewer.name ?? ''
  const first = fullName.trim().split(/\s+/)[0]
  return (
    <Container size="md" h="100%" px="md">
      <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
        <Anchor
          component={Link}
          to="/players"
          fw={700}
          c="var(--mantine-color-text)"
          underline="never"
          // Short, to leave room for a club selector later.
          aria-label="Northland Badminton, home"
          title="Northland Badminton"
        >
          <Group component="span" gap={6} wrap="nowrap">
            <IconHome size={20} stroke={2} />
            NBA
          </Group>
        </Anchor>
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
