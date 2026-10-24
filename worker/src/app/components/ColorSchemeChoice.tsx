import {
  SegmentedControl,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'

/** Light / Dark, in words (V13). Until chosen, the device's setting applies. */
export function ColorSchemeChoice() {
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light', {
    getInitialValueInEffect: true,
  })
  return (
    <SegmentedControl
      size="xs"
      fullWidth
      aria-label="Colour scheme"
      value={computed}
      onChange={(v) => setColorScheme(v === 'dark' ? 'dark' : 'light')}
      data={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  )
}
