import type { ComponentType } from 'react'

/**
 * A single actionable row in the command palette.
 *
 * Domains are intentionally loosely typed: any feature (games, movies, music,
 * system, plugins...) can register commands without the hub knowing about them.
 */
export type CommandDomain =
  | 'navigation'
  | 'media'
  | 'games'
  | 'system'
  | 'plugin'

export interface Command {
  /** Stable unique id — used for the keyboard-active index. */
  id: string
  /** Primary line, e.g. "Launch Cyberpunk 2077". */
  title: string
  /** Secondary line, e.g. "Installed · 120h played". */
  subtitle?: string
  /** Optional leading icon component (lucide-style: renders a className). */
  icon?: ComponentType<{ className?: string }>
  domain: CommandDomain
  /** Extra search terms beyond `title`. */
  keywords?: string[]
  /** What running the command does. May navigate, launch, or execute. */
  run: () => void | Promise<void>
}

/**
 * A domain participates in the hub by exposing a provider. The palette calls
 * `search(query)` on every registered provider and merges the results.
 *
 * Providers are plain async functions so they can hit local IPC (launcher
 * SQLite) or the Otix API without coupling to React or the router.
 */
export interface CommandProvider {
  id: string
  /** Section label in the palette, e.g. "Games". */
  label: string
  domain: CommandDomain
  /**
   * Return commands matching `query`. An empty query should return
   * "default" / frequently-used commands (or `[]`).
   */
  search: (query: string) => Command[] | Promise<Command[]>
}
