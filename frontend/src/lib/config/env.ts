/**
 * Application environment variables and dynamic UI configuration.
 *
 * Supported flags:
 * - VITE_NAV_PILLS_ENABLED: Master switch for navigation pills (default: true)
 * - VITE_LAUNCHER_CLEAR_NAV_PILLS: Suppress navigation pills in /launcher (default: false = do not clear, pills visible)
 * - VITE_GAME_CLEAR_NAV_PILLS: Suppress navigation pills in /game (default: true)
 */

function parseBool(val: string | undefined, defaultValue: boolean): boolean {
  if (val === undefined || val === '') return defaultValue
  return val.toLowerCase() === 'true' || val === '1'
}

export const ENV = {
  /** Master flag: whether floating navigation pills are enabled app-wide (default: true) */
  NAV_PILLS_ENABLED: parseBool(import.meta.env?.VITE_NAV_PILLS_ENABLED, true),

  /**
   * Whether to clear/hide navigation pills on launcher routes (/launcher).
   * Default is false (pills stay visible). Can be overridden via VITE_LAUNCHER_CLEAR_NAV_PILLS=true or component context.
   */
  LAUNCHER_CLEAR_NAV_PILLS: parseBool(import.meta.env?.VITE_LAUNCHER_CLEAR_NAV_PILLS, false),

  /** Whether to clear navigation pills on game fullscreen routes (/game). Default: true */
  GAME_CLEAR_NAV_PILLS: parseBool(import.meta.env?.VITE_GAME_CLEAR_NAV_PILLS, true),

  /**
   * Whether to hide the theme choice in settings.
   * Defaults to true in production (until light mode is fixed), false in development.
   */
  HIDE_THEME_CHOICE: parseBool(import.meta.env?.VITE_HIDE_THEME_CHOICE, Boolean(import.meta.env?.PROD)),

  /**
   * Whether to force dark mode app-wide.
   * Defaults to true in production (until light mode is fixed), false in development.
   */
  FORCE_DARK_MODE: parseBool(import.meta.env?.VITE_FORCE_DARK_MODE, Boolean(import.meta.env?.PROD)),

  /**
   * Default theme for fresh sessions without a saved preference.
   * Defaults to 'dark'.
   */
  DEFAULT_THEME: (import.meta.env?.VITE_DEFAULT_THEME as 'dark' | 'light' | 'system') || 'dark',
} as const
