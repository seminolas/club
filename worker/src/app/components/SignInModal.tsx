import { Button, Modal, Stack, Text } from '@mantine/core'
import { INFO_TEXT } from '../lib/colors'
import { useState } from 'react'
import { signInWithGoogle } from '../lib/auth'

export function SignInModal(props: {
  opened: boolean
  onClose: () => void
  /** Why the last attempt failed, if it did. */
  error?: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = error ?? props.error
  return (
    <Modal
      opened={props.opened}
      onClose={() => {
        setError(null)
        props.onClose()
      }}
      title="Sign in"
      size="sm"
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c={INFO_TEXT}>
          Sign in with your Google account.
        </Text>
        <Button
          variant="default"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await signInWithGoogle()
            } catch (e) {
              setError((e as Error).message)
              setBusy(false)
            }
          }}
        >
          Sign in with Google
        </Button>
        {shown && (
          <Text size="sm" c="red" ta="center">
            {shown}
          </Text>
        )}
      </Stack>
    </Modal>
  )
}
