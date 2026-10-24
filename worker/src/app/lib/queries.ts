import { queryOptions } from '@tanstack/react-query'
import { claimablePlayersFn, getViewerFn } from '../fns/viewer'

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewerFn(),
})

export const claimableQuery = queryOptions({
  queryKey: ['claimable'],
  queryFn: () => claimablePlayersFn(),
})
