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

export const playerFn = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(({ data }) => playerProfile(requestContext(), data))

export const updatePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; fields: ProfileChange }) => input)
  .handler(({ data }) => updatePlayer(requestContext(), data.id, data.fields))

export const unlinkPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(({ data }) => unlinkPlayer(requestContext(), data))

export const removePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(({ data }) => removePlayer(requestContext(), data))

export const searchHcFn = createServerFn({ method: 'GET' })
  .inputValidator((q: string) => q)
  .handler(({ data }) => searchHcMembers(requestContext(), data))
