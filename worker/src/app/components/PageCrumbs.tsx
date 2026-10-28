// A detail page's breadcrumb: the list it belongs to (a link), then the page
// itself as plain text, marked as the current page (WAI-ARIA APG breadcrumb
// pattern). Mantine's Breadcrumbs.
import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

export function PageCrumbs(props: {
  parent: { label: string; to: '/sessions' | '/players' }
  current: string
}) {
  return (
    <nav aria-label="Breadcrumb">
      <Breadcrumbs separator="›" separatorMargin={6}>
        <Anchor component={Link} to={props.parent.to} size="sm">
          {props.parent.label}
        </Anchor>
        <Text size="sm" fw={600} aria-current="page">
          {props.current}
        </Text>
      </Breadcrumbs>
    </nav>
  )
}
