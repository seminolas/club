import { createServerFn } from '@tanstack/react-start'
import {
  playerProfile,
  removePlayer,
  searchHcMembers,
  unlinkPlayer,
  updatePlayer,
} from '../../services/players'
import type { ProfileChange } from '../../services/players'
import { requestContext } from '../server/request'

/** A player, on a club's pages. */
type PlayerInput = { club: string; id: number }

export const playerFn = createServerFn({ method: 'GET' })
  .inputValidator((input: PlayerInput) => input)
  .handler(async ({ data }) =>
    playerProfile(await requestContext(data.club), data.id),
  )

export const updatePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((input: PlayerInput & { fields: ProfileChange }) => input)
  .handler(async ({ data }) =>
    updatePlayer(await requestContext(data.club), data.id, data.fields),
  )

export const unlinkPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((input: PlayerInput) => input)
  .handler(async ({ data }) =>
    unlinkPlayer(await requestContext(data.club), data.id),
  )

export const removePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((input: PlayerInput) => input)
  .handler(async ({ data }) =>
    removePlayer(await requestContext(data.club), data.id),
  )

// HelloClub members: the organisation's, whichever club.
export const searchHcFn = createServerFn({ method: 'GET' })
  .inputValidator((q: string) => q)
  .handler(async ({ data }) => searchHcMembers(await requestContext(), data))
