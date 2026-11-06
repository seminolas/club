// A session night, for the session page (UI-PORT.md, U4–U6).
import { createServerFn } from '@tanstack/react-start'
import {
  addPlayer,
  closeSession,
  deleteSession,
  getSession,
  reopenAttendance,
  reopenSession,
  saveBoxes,
  setAttendance,
} from '../../services/session-night'
import type { BoxInput } from '../../types'
import { requestContext } from '../server/request'

/** A session night, on its club's pages. */
type Night = { club: string; date: string }

export const sessionFn = createServerFn({ method: 'GET' })
  .inputValidator((input: Night) => input)
  .handler(async ({ data }) =>
    getSession(await requestContext(data.club), data.date),
  )

export const setAttendanceFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: Night & { playerId: number; attending: boolean }) => input,
  )
  .handler(async ({ data }) =>
    setAttendance(
      await requestContext(data.club),
      data.date,
      data.playerId,
      data.attending,
    ),
  )

export const addPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (
      input: Night & {
        name: string
        insertRank: number
        preferredName: string | null
      },
    ) => input,
  )
  .handler(async ({ data }) => {
    const { club, ...input } = data
    return addPlayer(await requestContext(club), input)
  })

export const saveBoxesFn = createServerFn({ method: 'POST' })
  .inputValidator((input: Night & { boxes: BoxInput[] }) => input)
  .handler(async ({ data }) =>
    saveBoxes(await requestContext(data.club), data.date, data.boxes),
  )

export const closeSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((input: Night & { ladderAfter: number[] }) => input)
  .handler(async ({ data }) =>
    closeSession(await requestContext(data.club), data.date, data.ladderAfter),
  )

export const reopenSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((input: Night) => input)
  .handler(async ({ data }) =>
    reopenSession(await requestContext(data.club), data.date),
  )

export const reopenAttendanceFn = createServerFn({ method: 'POST' })
  .inputValidator((input: Night) => input)
  .handler(async ({ data }) =>
    reopenAttendance(await requestContext(data.club), data.date),
  )

export const deleteSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((input: Night) => input)
  .handler(async ({ data }) =>
    deleteSession(await requestContext(data.club), data.date),
  )
