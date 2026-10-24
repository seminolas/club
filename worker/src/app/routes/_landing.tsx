// The landing page: plain tabs, each its own list (lab: AppDemo).
import { Tabs } from '@mantine/core'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'

const TABS = [
  { to: '/players', label: 'Players' },
  { to: '/sessions', label: 'Sessions' },
] as const

export const Route = createFileRoute('/_landing')({ component: Landing })

function Landing() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = TABS.find((t) => pathname.endsWith(t.to))?.to ?? '/players'
  return (
    <Tabs value={current} onChange={(v) => v && void navigate({ to: v })}>
      <Tabs.List grow mb="sm">
        {TABS.map((t) => (
          <Tabs.Tab key={t.to} value={t.to}>
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Outlet />
    </Tabs>
  )
}
