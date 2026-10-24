import { createServerFn } from '@tanstack/react-start'
import { createSession, sessionList } from '../../services/sessions'
import { requestContext } from '../server/request'

export const sessionListFn = createServerFn({ method: 'GET' }).handler(() =>
  sessionList(requestContext()),
)

export const createSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((date: string) => date)
  .handler(async ({ data }) => {
    await createSession(requestContext(), data)
  })
