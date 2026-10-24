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

export const sessionFn = createServerFn({ method: 'GET' })
  .inputValidator((date: string) => date)
  .handler(({ data }) => getSession(requestContext(), data))

export const setAttendanceFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { date: string; playerId: number; attending: boolean }) => input,
  )
  .handler(({ data }) =>
    setAttendance(requestContext(), data.date, data.playerId, data.attending),
  )

export const addPlayerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: {
      date: string
      name: string
      insertRank: number
      preferredName: string | null
    }) => input,
  )
  .handler(({ data }) => addPlayer(requestContext(), data))

export const saveBoxesFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { date: string; boxes: BoxInput[] }) => input)
  .handler(({ data }) => saveBoxes(requestContext(), data.date, data.boxes))

export const closeSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { date: string; ladderAfter: number[] }) => input)
  .handler(({ data }) =>
    closeSession(requestContext(), data.date, data.ladderAfter),
  )

export const reopenSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((date: string) => date)
  .handler(({ data }) => reopenSession(requestContext(), data))

export const reopenAttendanceFn = createServerFn({ method: 'POST' })
  .inputValidator((date: string) => date)
  .handler(({ data }) => reopenAttendance(requestContext(), data))

export const deleteSessionFn = createServerFn({ method: 'POST' })
  .inputValidator((date: string) => date)
  .handler(({ data }) => deleteSession(requestContext(), data))
