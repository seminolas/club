import { createServerFn } from '@tanstack/react-start'
import { listClubs } from '../../services/clubs'
import { createSession, sessionList } from '../../services/sessions'
import { requestContext } from '../server/request'

export const sessionListFn = createServerFn({ method: 'GET' })
  .inputValidator((club: string) => club)
  .handler(async ({ data }) => sessionList(await requestContext(data)))

export const createSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { club: string; date: string }) => input)
  .handler(async ({ data }) => {
    await createSession(await requestContext(data.club), data.date)
  })

/** The clubs the app serves: slug, label and session title, for the UI. */
export const clubsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requestContext()
  return (await listClubs(ctx.db)).map((c) => ({
    slug: c.slug,
    label: c.label,
    title: c.title,
  }))
})
