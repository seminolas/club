// The breadcrumb, in the header: home (the house), the list a page belongs to
// (a link), then the page itself as plain text, marked as the current page
// (WAI-ARIA APG breadcrumb pattern). Mantine's Breadcrumbs. A page declares
// its trail on its route (`staticData.crumbs`); the landing pages have none
// (their tabs say where you are), so the header shows home alone.
import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export interface Crumbs {
  parent: { label: string; to: '/sessions' | '/players' }
  current: string
  /** Shorter text for the current page on phones, e.g. "5 Nov". */
  short?: string
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The page's breadcrumb trail: a hook, called while the page shows. */
    crumbs?: () => Crumbs
  }
}

export function PageCrumbs(props: { home: ReactNode; use: () => Crumbs }) {
  const c = props.use()
  return (
    <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
      <Breadcrumbs
        separator="›"
        separatorMargin={6}
        // One line; the current page is cut short ("…") if it doesn't fit.
        styles={{ root: { flexWrap: 'nowrap', minWidth: 0 } }}
      >
        {props.home}
        <Anchor component={Link} to={c.parent.to} size="sm">
          {c.parent.label}
        </Anchor>
        <Text size="sm" fw={600} aria-current="page" truncate miw={0}>
          {c.short ? (
            <>
              <Text span inherit visibleFrom="xs">
                {c.current}
              </Text>
              <Text span inherit hiddenFrom="xs">
                {c.short}
              </Text>
            </>
          ) : (
            c.current
          )}
        </Text>
      </Breadcrumbs>
    </nav>
  )
}
