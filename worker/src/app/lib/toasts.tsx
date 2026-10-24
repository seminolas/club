// Confirms and toasts: club-next's helpers (via club-table-lab's
// clubnext/actions.tsx and lab/notices.tsx).
import { Button, Group, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'

export function confirmAction(opts: {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}) {
  modals.openConfirmModal({
    title: opts.title,
    children:
      typeof opts.message === 'string' ? (
        <Text size="sm">{opts.message}</Text>
      ) : (
        opts.message
      ),
    labels: {
      confirm: opts.confirmLabel,
      cancel: opts.cancelLabel ?? 'Cancel',
    },
    confirmProps: { color: opts.danger ? 'red' : undefined },
    onConfirm: () => void opts.onConfirm(),
  })
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function toastError(err: unknown) {
  notifications.show({
    color: 'red',
    title: 'Couldn’t do that',
    message: errorMessage(err),
  })
}

export function toastOk(message: string) {
  notifications.show({ color: 'teal', message })
}

/** A confirmation with Undo, for when Enter hit the wrong person. */
export function toastWithUndo(message: string, undo: () => void) {
  const id = notifications.show({
    color: 'teal',
    autoClose: 5000,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{message}</Text>
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={() => {
            undo()
            notifications.hide(id)
          }}
        >
          Undo
        </Button>
      </Group>
    ),
  })
}
