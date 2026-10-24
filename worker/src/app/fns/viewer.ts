import { createServerFn } from '@tanstack/react-start'
import {
  claimPlayer,
  claimablePlayers,
  loadViewer,
} from '../../services/viewer'
import { requestContext } from '../server/request'

export const getViewerFn = createServerFn({ method: 'GET' }).handler(() =>
  loadViewer(requestContext()),
)

export const claimablePlayersFn = createServerFn({ method: 'GET' }).handler(
  () => claimablePlayers(requestContext()),
)

export const claimPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator((playerId: number) => playerId)
  .handler(({ data }) => claimPlayer(requestContext(), data))
