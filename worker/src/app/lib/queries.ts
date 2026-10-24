import { queryOptions } from '@tanstack/react-query'
import { ladderFn } from '../fns/ladder'
import { playerFn } from '../fns/players'
import { sessionListFn } from '../fns/sessions'
import { claimablePlayersFn, getViewerFn } from '../fns/viewer'

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewerFn(),
})

export const claimableQuery = queryOptions({
  queryKey: ['claimable'],
  queryFn: () => claimablePlayersFn(),
})

export const ladderQuery = queryOptions({
  queryKey: ['ladder'],
  queryFn: () => ladderFn(),
})

export const sessionListQuery = queryOptions({
  queryKey: ['sessions'],
  queryFn: () => sessionListFn(),
})

export const playerQuery = (id: number) =>
  queryOptions({
    queryKey: ['player', id],
    queryFn: () => playerFn({ data: id }),
  })
