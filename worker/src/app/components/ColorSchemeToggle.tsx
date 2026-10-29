import {
  Switch,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { IconMoonStars, IconSun } from '@tabler/icons-react'

/**
 * A day/night switch in the header (ui.mantine.dev, Theme toggle): the thumb
 * shows the current mode, a sun or a moon. Until it's used, the device's
 * setting applies; the choice is then remembered in this browser.
 */
export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const dark =
    useComputedColorScheme('light', { getInitialValueInEffect: true }) ===
    'dark'
  return (
    <Tooltip label={dark ? 'Dark mode' : 'Light mode'} openDelay={300}>
      <Switch
        size="lg"
        color="dark.4"
        aria-label="Dark mode"
        data-test="color-scheme"
        checked={dark}
        onChange={(e) =>
          setColorScheme(e.currentTarget.checked ? 'dark' : 'light')
        }
        withThumbIndicator={false}
        thumbIcon={
          dark ? (
            <IconMoonStars
              size={14}
              stroke={2.5}
              color="var(--mantine-color-blue-6)"
            />
          ) : (
            <IconSun
              size={14}
              stroke={2.5}
              color="var(--mantine-color-yellow-7)"
            />
          )
        }
      />
    </Tooltip>
  )
}
