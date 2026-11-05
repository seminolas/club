// The landing page: plain tabs, each its own list (lab: AppDemo), for the
// club in the URL.
import { Tabs } from '@mantine/core'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'

const TABS = [
  { to: '/$club/players', tail: '/players', label: 'Players' },
  { to: '/$club/sessions', tail: '/sessions', label: 'Sessions' },
] as const

export const Route = createFileRoute('/$club/_landing')({ component: Landing })

function Landing() {
  const { club } = Route.useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = TABS.find((t) => pathname.endsWith(t.tail)) ?? TABS[0]
  return (
    <Tabs
      className="club-tabs"
      value={current.to}
      onChange={(v) => {
        const tab = TABS.find((t) => t.to === v)
        if (tab) void navigate({ to: tab.to, params: { club } })
      }}
    >
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
