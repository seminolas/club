import {
  Box,
  ColorSchemeScript,
  Container,
  MantineProvider,
  mantineHtmlProps,
} from '@mantine/core'
import mantineCss from '@mantine/core/styles.css?url'
import { useMediaQuery } from '@mantine/hooks'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import notificationsCss from '@mantine/notifications/styles.css?url'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AppHeader } from '../components/AppHeader'
import { ClaimModal } from '../components/ClaimModal'
import { SignInModal } from '../components/SignInModal'
import { signOut } from '../lib/auth'
import { viewerQuery } from '../lib/queries'
import { toastOk } from '../lib/toasts'
import appCss from '../styles.css?url'
import { theme } from '../theme'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Northland Badminton' },
      ],
      links: [
        { rel: 'stylesheet', href: mantineCss },
        { rel: 'stylesheet', href: notificationsCss },
        { rel: 'stylesheet', href: appCss },
        {
          rel: 'icon',
          href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏸</text></svg>',
        },
      ],
    }),
    beforeLoad: ({ context }) =>
      context.queryClient.ensureQueryData(viewerQuery),
    shellComponent: RootDocument,
    component: RootLayout,
  },
)

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <ModalsProvider>{children}</ModalsProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const queryClient = useQueryClient()
  const { data: viewer } = useSuspenseQuery(viewerQuery)
  const phone = useMediaQuery('(max-width: 36em)')
  const [signIn, setSignIn] = useState<{ open: boolean; error?: string }>({
    open: false,
  })

  // Back from Google: a failed sign-in comes back with ?error; a login just
  // linked to its player by email gets a toast.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('error')) {
      setSignIn({
        open: true,
        error: 'Sign-in didn’t complete. Please try again.',
      })
      history.replaceState(null, '', location.pathname + location.hash)
    }
  }, [])
  useEffect(() => {
    if (viewer.justLinked && viewer.player)
      toastOk(`Signed in as ${viewer.player.name}.`)
  }, [viewer.justLinked, viewer.player])

  const onSignOut = async () => {
    await signOut().catch(() => {})
    await queryClient.invalidateQueries()
  }

  return (
    // The header scrolls away, so the session's pinned bar and the tables'
    // sticky search bars can use the top of the screen (as in the lab).
    <>
      {/* Capped to the screen: the default 440px is wider than a phone. On
          phones at the bottom, clear of the pinned bars at the top. */}
      <Notifications
        position={phone ? 'bottom-center' : 'top-center'}
        containerWidth="min(27.5rem, calc(100vw - 2rem))"
      />
      <Box
        component="header"
        h={52}
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <AppHeader
          viewer={viewer}
          onSignIn={() => setSignIn({ open: true })}
          onSignOut={onSignOut}
        />
      </Box>
      <Container component="main" size="md" px="md" py="md">
        <Outlet />
      </Container>
      <SignInModal
        opened={signIn.open}
        error={signIn.error}
        onClose={() => setSignIn({ open: false })}
      />
      <ClaimModal
        opened={viewer.signedIn && !viewer.player}
        onSignOut={onSignOut}
      />
    </>
  )
}
