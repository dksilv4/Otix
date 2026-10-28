import { useContext } from 'react'
import { LauncherThemeContext } from '../themes/theme-context'

/**
 * Access the active launcher theme state and switcher.
 */
export const useLauncherTheme = () => {
  const ctx = useContext(LauncherThemeContext)
  if (!ctx) {
    throw new Error('useLauncherTheme must be used within a LauncherThemeProvider')
  }
  return ctx
}
