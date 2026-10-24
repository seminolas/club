// Sync to HelloClub (admins, closed sessions): runs the existing sync
// (POST /api/hc/sync, unchanged) and shows its log, as the old UI's modal.
// Never run it on staging: its HelloClub key is deliberately fake.
import { Button, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { INFO_TEXT } from '../../lib/colors'

interface LogLine {
  text: string
  type?: 'ok' | 'error' | 'warn' | 'info'
}
const COLOR: Record<string, string> = {
  ok: 'var(--mantine-color-teal-text)',
  error: 'var(--mantine-color-red-text)',
  warn: 'var(--mantine-color-yellow-text)',
  info: INFO_TEXT,
}

export function HcSyncModal(props: {
  date: string | null
  onClose: () => void
}) {
  const [log, setLog] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!props.date) return
    let cancelled = false
    setLog([])
    setRunning(true)
    void (async () => {
      try {
        const res = await fetch('/api/hc/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_date: props.date }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          log?: LogLine[]
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !data.log)
          setLog([
            {
              text: `Error: ${data.error ?? `API error: ${res.status}`}`,
              type: 'error',
            },
          ])
        else setLog(data.log)
      } catch (e) {
        if (!cancelled)
          setLog([{ text: `Error: ${(e as Error).message}`, type: 'error' }])
      } finally {
        if (!cancelled) setRunning(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.date])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [log])

  return (
    <Modal
      opened={props.date !== null}
      onClose={() => !running && props.onClose()}
      withCloseButton={!running}
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      title="HelloClub sync"
      size="lg"
      centered
    >
      <Stack gap="sm">
        <ScrollArea.Autosize mah="60vh">
          <Stack gap={2} ff="monospace">
            {running && (
              <Text size="sm" c={INFO_TEXT}>
                Running…
              </Text>
            )}
            {log.map((line, i) => (
              <Text
                key={i}
                size="xs"
                ff="monospace"
                c={COLOR[line.type ?? 'info']}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {line.text || ' '}
              </Text>
            ))}
            <div ref={end} />
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" disabled={running} onClick={props.onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
