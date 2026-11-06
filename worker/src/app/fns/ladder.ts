import { createServerFn } from '@tanstack/react-start'
import { importLadder, ladder } from '../../services/ladder'
import { requestContext } from '../server/request'

export const ladderFn = createServerFn({ method: 'GET' })
  .inputValidator((club: string) => club)
  .handler(async ({ data }) => ladder(await requestContext(data)))

export const importLadderFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { club: string; names: string[] }) => input)
  .handler(async ({ data }) =>
    importLadder(await requestContext(data.club), data.names),
  )
