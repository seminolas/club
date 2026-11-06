// Admin pages (/admin/…), outside any club: admins only; anyone else goes
// home.
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { viewerQuery } from '../../lib/queries'

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(viewerQuery)
    if (!viewer.isAdmin) throw redirect({ to: '/' })
  },
  component: Outlet,
})
