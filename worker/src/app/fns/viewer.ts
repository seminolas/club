import { createServerFn } from '@tanstack/react-start'
import {
  claimPlayer,
  claimablePlayers,
  loadViewer,
} from '../../services/viewer'
import { requestContext } from '../server/request'

// Who's signed in isn't a club's own: people are shared across clubs
// (MULTI-CLUB.md).
export const getViewerFn = createServerFn({ method: 'GET' }).handler(async () =>
  loadViewer(await requestContext()),
)

export const claimablePlayersFn = createServerFn({ method: 'GET' }).handler(
  async () => claimablePlayers(await requestContext()),
)

export const claimPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((playerId: number) => playerId)
  .handler(async ({ data }) => claimPlayer(await requestContext(), data))
