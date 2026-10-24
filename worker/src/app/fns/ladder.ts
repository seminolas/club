import { createServerFn } from '@tanstack/react-start'
import { importLadder, ladder } from '../../services/ladder'
import { requestContext } from '../server/request'

export const ladderFn = createServerFn({ method: 'GET' }).handler(() =>
  ladder(requestContext()),
)

export const importLadderFn = createServerFn({ method: 'POST' })
  .inputValidator((names: string[]) => names)
  .handler(({ data }) => importLadder(requestContext(), data))
