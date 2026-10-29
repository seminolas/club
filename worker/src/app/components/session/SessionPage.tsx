// A session's page (UI-PORT.md, "Session page"): the card with the way
// forward, "…" and the steps; one view per step, all kept mounted so typed
// scores survive moving between steps; live reloads from the session's
// channel. The moves are the old UI's, with the lab's confirms.
import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BoxInput } from '../../../types'
import {
  closeSessionFn,
  deleteSessionFn,
  reopenAttendanceFn,
  reopenSessionFn,
  saveBoxesFn,
} from '../../fns/session'
import { INFO_TEXT } from '../../lib/colors'
import { useSessionLive } from '../../lib/live'
import type { LiveChannel } from '../../lib/live'
import { boxName } from '../../lib/names'
import { useScoreEntry } from '../../lib/scores'
import { printSignInSheet } from '../../lib/print'
import { shareOnWhatsApp } from '../../lib/share'
import {
  ladderQuery,
  sessionListQuery,
  FRESH_MS,
  sessionQuery,
  viewerQuery,
} from '../../lib/queries'
import { ladderAfter, movement, phaseOf, progress } from '../../lib/session'
import { confirmAction, toastError, toastOk } from '../../lib/toasts'
import { sessionDate } from '../list-helpers'
import { PageCrumbs } from '../PageCrumbs'
import { AssignBoxesModal } from './AssignBoxesModal'
import { ScoreSheets } from '../print/ScoreSheets'
import type { SheetLayout } from '../print/ScoreSheets'
import { BoxesStep } from './BoxesStep'
import { HcSyncModal } from './HcSyncModal'
import { ResultsStep } from './ResultsStep'
import type { Person } from './AssignBoxesModal'
import { CheckInStep } from './CheckInStep'
import { PINNED_H, useSessionCard } from './SessionCard'
import type { MenuAction, StepAction, StepId } from './SessionCard'

/**
 * The boxes cleared by the last Re-open check-in, per session, offered first
 * by the next Assign. In memory only (as in the old UI): lost on reload.
 */
const previousLayouts = new Map<string, number[][]>()

export function SessionPage(props: { date: string; step: StepId }) {
  const { date, step } = props
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: session } = useSuspenseQuery(sessionQuery(date))
  const { data: viewer } = useSuspenseQuery(viewerQuery)
  const { data: ladder } = useSuspenseQuery(ladderQuery)
  const { data: sessions } = useSuspenseQuery(sessionListQuery)
  const [assigning, setAssigning] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetLayout>('cards')
  // Print the score sheets in a layout, once React has drawn it.
  const printSheets = (layout: SheetLayout) => {
    setSheets(layout)
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  const reload = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['session', date] }),
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['ladder'] }),
    ])
  // Scores: typed cells are kept until saved; everything else follows the
  // live channel (lib/scores.ts).
  const channel = useRef<LiveChannel | null>(null)
  const scores = useScoreEntry(date, channel)
  const live = useSessionLive(date, {
    onChanged: (firstConnect) => {
      // The first connection comes a moment after the page loaded its data:
      // skip the catch-up while that data is fresh (the query client's
      // staleTime), so a page view doesn't read everything twice.
      const loaded = queryClient.getQueryState(sessionQuery(date).queryKey)
      if (
        firstConnect &&
        loaded &&
        Date.now() - loaded.dataUpdatedAt < FRESH_MS
      )
        return
      void scores.refresh().catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['ladder'] })
    },
    onMatch: scores.mergeMatch,
    onSettled: scores.settled,
  })
  channel.current = live.channel

  const phase = phaseOf(session.status)
  const admin = viewer.isAdmin
  const isLatest = sessions[0]?.date === date
  const prog = progress(session.boxes)
  const allFinished = prog.boxes > 0 && prog.finishedBoxes === prog.boxes
  const goStep = (s: StepId) =>
    void navigate({
      to: '/sessions/$date/$step',
      params: { date, step: s },
      replace: true,
    })

  // A move: the server call, then reload and go to the step it opens.
  const move = async (
    run: () => Promise<unknown>,
    done: string,
    then?: StepId,
  ) => {
    try {
      await run()
      await reload()
      if (then) goStep(then)
      toastOk(done)
    } catch (e) {
      toastError(e)
    }
  }

  // Players coming, best ladder position first (for Assign boxes).
  const details = new Map(ladder.map((p) => [p.id, p]))
  const rank = new Map(session.leaderboardBefore.map((p, i) => [p.id, i]))
  const coming: Person[] = [...session.attendees]
    .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999))
    .map((p) => ({
      id: p.id,
      name: p.name,
      preferredName: details.get(p.id)?.preferredName ?? null,
    }))
  const current = session.boxes.map((b) => b.players.map((p) => p.id))
  const previous =
    phase === 'playing' && current.length
      ? current
      : (previousLayouts.get(date) ?? null)

  const assign = async (boxes: BoxInput[]) => {
    try {
      await saveBoxesFn({ data: { date, boxes } })
      previousLayouts.delete(date)
      setAssigning(false)
      await reload()
      goStep('boxes')
      toastOk('Boxes assigned')
    } catch (e) {
      toastError(e)
    }
  }

  // Names in boxes: the score sheets' rule across everyone playing tonight.
  const playing = session.boxes.flatMap((b) =>
    b.players.map((p) => ({
      ...p,
      preferredName: details.get(p.id)?.preferredName ?? null,
    })),
  )
  const boxLabels = new Map(playing.map((p) => [p.id, boxName(p, playing)]))
  const label = (id: number) => boxLabels.get(id) ?? ''
  // Admins any box; a signed-in player their own box; nobody once closed.
  const canEdit = (bi: number) =>
    phase === 'playing' &&
    (admin ||
      (!!viewer.player &&
        !!session.boxes[bi]?.players.some((p) => p.id === viewer.player?.id)))

  const scoreCount = session.boxes.reduce(
    (n, b) => n + b.matches.reduce((m, x) => m + x.sets.length, 0),
    0,
  )
  const reopenCheckin = () =>
    confirmAction({
      title: 'Re-open check-in?',
      message: `The ${prog.boxes} box${prog.boxes !== 1 ? 'es' : ''}${
        scoreCount
          ? ` and ${scoreCount} entered score${scoreCount !== 1 ? 's' : ''}`
          : ''
      } are deleted. This can’t be undone. Check-in opens again; boxes are assigned afresh.`,
      confirmLabel: 'Delete boxes and re-open',
      cancelLabel: 'Keep playing',
      danger: true,
      onConfirm: () =>
        move(
          async () => {
            await reopenAttendanceFn({ data: date })
            previousLayouts.set(date, current)
          },
          'Check-in re-opened',
          'checkin',
        ),
    })
  const reassign = () =>
    confirmAction({
      title: 'Reassign boxes?',
      message: 'Reassigning boxes clears all current scores.',
      confirmLabel: 'Choose new boxes',
      danger: true,
      onConfirm: () => setAssigning(true),
    })
  const close = () => {
    const before = session.leaderboardBefore.map((p) => p.id)
    const after = ladderAfter(session)
    const { up, down } = movement(before, after)
    confirmAction({
      title: 'Close the session?',
      message: isLatest
        ? `The ladder moves: ${up} player${up !== 1 ? 's' : ''} up, ${down} down. Scores can’t be changed afterwards (unless it’s re-opened).`
        : 'This is not the most recent session: the ladder won’t be affected.',
      confirmLabel: 'Close session',
      cancelLabel: 'Not yet',
      onConfirm: () =>
        move(
          () => closeSessionFn({ data: { date, ladderAfter: after } }),
          isLatest ? 'Session closed. Ladder updated.' : 'Session closed.',
          'results',
        ),
    })
  }
  const reopenSession = () =>
    confirmAction({
      title: 'Re-open the session?',
      message: isLatest
        ? 'Scores can be changed again. Close the session again when they’re right, to update the ladder.'
        : 'Scores can be changed again and the session re-closed. This is not the most recent session: the ladder won’t be affected.',
      confirmLabel: 'Re-open session',
      cancelLabel: 'Keep closed',
      danger: true,
      onConfirm: () =>
        move(
          () => reopenSessionFn({ data: date }),
          'Session re-opened',
          'boxes',
        ),
    })
  const remove = () =>
    confirmAction({
      title: 'Delete the session?',
      message: `Delete the session of ${sessionDate(date)}? This permanently removes all attendance, boxes and scores. It can’t be undone.`,
      confirmLabel: 'Delete session',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteSessionFn({ data: date })
          await queryClient.invalidateQueries()
          toastOk('Session deleted.')
          void navigate({ to: '/sessions' })
        } catch (e) {
          toastError(e)
        }
      },
    })

  const menu: MenuAction[] = !admin
    ? []
    : [
        ...(phase === 'playing'
          ? [
              {
                label: 'Reassign boxes…',
                hint: 'Clears all current scores',
                run: reassign,
              },
              {
                label: 'Re-open check-in…',
                hint: 'Deletes the boxes and their scores',
                run: reopenCheckin,
              },
            ]
          : []),
        ...(phase === 'closed'
          ? [
              {
                label: 'Re-open session…',
                hint: isLatest
                  ? 'Scores can be changed; re-close to update the ladder'
                  : 'Scores can be changed again',
                run: reopenSession,
              },
            ]
          : []),
        {
          label: 'Delete session…',
          hint: 'Removes its attendance, boxes and scores',
          run: remove,
        },
      ]

  const stepActions: Record<StepId, StepAction[]> = {
    checkin: [
      {
        label: 'Print sign-in sheet',
        run: () => {
          const names = session.leaderboardBefore.map((p) => p.name)
          if (!printSignInSheet(date, names))
            toastError(
              new Error('Pop-up blocked — allow pop-ups for this site'),
            )
        },
      },
    ],
    boxes: [
      {
        label: 'Print score sheets',
        items: [
          { label: 'Cards', run: () => printSheets('cards') },
          { label: 'Grid', run: () => printSheets('grid') },
        ],
      },
    ],
    results: [
      { label: 'Share on WhatsApp', run: () => shareOnWhatsApp(date) },
      ...(admin
        ? [{ label: 'Sync to HelloClub', run: () => setSyncing(date) }]
        : []),
    ],
  }

  const card = useSessionCard({
    phase,
    step,
    onStep: goStep,
    count:
      phase === 'checkin'
        ? ['Attending', String(session.attendees.length)]
        : phase === 'playing'
          ? ['Matches', `${prog.matches}/${prog.matchesTotal}`]
          : ['Players', String(session.attendees.length)],
    status:
      phase === 'checkin'
        ? `${session.attendees.length} attending`
        : phase === 'playing'
          ? `${prog.finishedBoxes} of ${prog.boxes} boxes finished`
          : `${session.attendees.length} players`,
    forward: !admin
      ? undefined
      : phase === 'checkin'
        ? {
            label: 'Assign boxes',
            run: () => setAssigning(true),
            blocked:
              session.attendees.length < 4
                ? 'Need at least 4 players attending'
                : undefined,
          }
        : phase === 'playing'
          ? {
              label: 'Close',
              run: close,
              blocked: allFinished ? undefined : 'Enter all scores first',
            }
          : undefined,
    menu,
    stepActions: stepActions[step],
    note:
      step === 'checkin' && phase === 'playing' && admin ? (
        <Text size="sm" c={INFO_TEXT}>
          Check-in is closed once boxes are assigned. To change who’s attending,
          re-open check-in (in “…”).
        </Text>
      ) : undefined,
  })

  // Every step stays mounted, so typed scores survive moving between steps.
  const view = (id: StepId, content: ReactNode) => (
    <Box key={id} hidden={step !== id}>
      {content}
    </Box>
  )
  return (
    <Stack gap="sm">
      {card.pinnedBar}
      <PageCrumbs
        parent={{ label: 'Sessions', to: '/sessions' }}
        // "20 Oct" (the weekday would repeat "Tuesday"); the year as in the
        // Sessions list.
        current={`Tuesday Box · ${sessionDate(date).replace(/^\S+ /, '')}`}
      />
      {live.problem && (
        <Alert color="yellow" p="xs">
          <Group justify="center" gap="sm">
            <Text size="sm">
              {live.problem === 'reconnecting'
                ? 'Connection lost – reconnecting…'
                : 'Some changes may not have been saved. Reload the page and check the scores.'}
            </Text>
            {live.problem === 'reload' && (
              <Button
                size="xs"
                variant="default"
                onClick={() => location.reload()}
              >
                Reload
              </Button>
            )}
          </Group>
        </Alert>
      )}
      {view(
        'checkin',
        <CheckInStep
          session={session}
          ladder={ladder}
          canMark={admin && phase === 'checkin'}
          header={card.content('checkin')}
          stickyTop={PINNED_H}
        />,
      )}
      {phase !== 'checkin' &&
        view(
          'boxes',
          <BoxesStep
            session={session}
            label={label}
            canEdit={canEdit}
            onScore={scores.setScore}
            header={card.content('boxes')}
            stickyTop={PINNED_H}
          />,
        )}
      {phase === 'closed' &&
        view(
          'results',
          <ResultsStep
            session={session}
            preferred={
              new Map(ladder.map((p) => [p.id, p.preferredName] as const))
            }
            header={card.content('results')}
            stickyTop={PINNED_H}
          />,
        )}
      {session.boxes.length > 0 && (
        <ScoreSheets boxes={session.boxes} layout={sheets} label={label} />
      )}
      <HcSyncModal date={syncing} onClose={() => setSyncing(null)} />
      <AssignBoxesModal
        opened={assigning}
        players={coming}
        previous={previous}
        onClose={() => setAssigning(false)}
        onAssign={assign}
      />
    </Stack>
  )
}
