// The clubs' admin screens (/admin/clubs): admins only (the services check).
import { createServerFn } from '@tanstack/react-start'
import {
  adminClubs,
  createClub,
  hcSeries,
  updateClub,
} from '../../services/clubs'
import type { ClubChange, NewClub } from '../../services/clubs'
import { requestContext } from '../server/request'

export const adminClubsFn = createServerFn({ method: 'GET' }).handler(
  async () => adminClubs(await requestContext()),
)

export const createClubFn = createServerFn({ method: 'POST' })
  .inputValidator((input: NewClub) => input)
  .handler(async ({ data }) => createClub(await requestContext(), data))

export const updateClubFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { slug: string; change: ClubChange }) => input)
  .handler(async ({ data }) =>
    updateClub(await requestContext(), data.slug, data.change),
  )

/** HelloClub's recurring series (read-only call), to link a club to one. */
export const hcSeriesFn = createServerFn({ method: 'GET' }).handler(async () =>
  hcSeries(await requestContext()),
)
