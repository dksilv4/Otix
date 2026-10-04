import { createContext, useContext } from 'react'
import { ENV } from '@/lib/config/env'

export interface NavPillsConfig {
  /** Master override for the current route or component tree */
  hidden?: boolean
  /** Specifically hide the left pill (logo & back button) */
  hideLeft?: boolean
  /** Specifically hide the right pill (search, notifications, user profile, now playing) */
  hideRight?: boolean
}

interface NavPillsContextValue {
  showLeft: boolean
  showRight: boolean
  setOverride: (override: NavPillsConfig | null) => void
}

export const NavPillsContext = createContext<NavPillsContextValue>({
  showLeft: true,
  showRight: true,
  setOverride: () => {},
})

/**
 * Hook for any page/component in the app to inspect or programmatically control
 * navigation pills visibility.
 *
 * Example:
 * ```tsx
 * const { showLeft, showRight, setOverride } = useNavPillsVisibility()
 * // Or to temporarily hide in a fullscreen modal:
 * useEffect(() => {
 *   setOverride({ hidden: true })
 *   return () => setOverride(null)
 * }, [setOverride])
 * ```
 */
export function useNavPillsVisibility() {
  return useContext(NavPillsContext)
}

/**
 * Evaluates whether pills should be shown given the current URL, global env config, and runtime override.
 */
export function computePillsVisibility(pathname: string, override: NavPillsConfig | null) {
  if (!ENV.NAV_PILLS_ENABLED) {
    return { showLeft: false, showRight: false }
  }

  if (override?.hidden) {
    return { showLeft: false, showRight: false }
  }

  const isLauncher = pathname.startsWith('/launcher')
  const isGame = pathname.startsWith('/game')

  let showLeft = true
  let showRight = true

  if (isGame && ENV.GAME_CLEAR_NAV_PILLS) {
    showLeft = false
  }

  if (isLauncher && ENV.LAUNCHER_CLEAR_NAV_PILLS) {
    showLeft = false
    showRight = false
  }

  if (override?.hideLeft) showLeft = false
  if (override?.hideRight) showRight = false

  return { showLeft, showRight }
}
