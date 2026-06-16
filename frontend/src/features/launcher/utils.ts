import type { LocalGame, DisplayGame } from './types'
import type { CatalogGameDetail } from './types'

/** Upscale TMDB/IGDB image URLs for hero backdrop use. */
export function heroImage(url: string): string {
  return url
    .replace(/\/w185\//, '/w1280/')
    .replace(/\/w342\//, '/w1280/')
    .replace(/\/w500\//, '/w1280/')
    .replace(/\/w780\//, '/w1280/')
    .replace(/t_cover_big/, 't_1080p')
    .replace(/t_screenshot_big/, 't_1080p')
}

/** Convert raw LocalGame → DisplayGame for the launcher view. */
export function toDisplayGame(g: LocalGame): DisplayGame {
  const platformLabel = g.platform.toUpperCase()
  const isMatched = !!g.data?.id
  const matchLabel = isMatched ? '✓ Matched' : (g.matchSuggestion ? '⚠ Suggestion' : 'Unmatched')
  return {
    id: g.id,
    title: g.data?.title || g.title,
    posterUrl: g.data?.posterUrl || g.posterUrl || null,
    backdropUrl: undefined,
    localIconUrl: g.localIconUrl || undefined,
    iconUrl: g.data?.iconUrl || g.iconUrl || undefined,
    logoUrl: undefined,
    badge: `${platformLabel} · ${matchLabel}`,
    playtime: '—',
    achievements: isMatched ? 'Owned' : '—',
    isDefault: false,
    platform: g.platform,
    exePath: g.exePath,
    installDir: g.installDir,
    isInstalled: !!g.exePath && g.platform !== 'iso',
    otixMediaId: g.data?.id || undefined,
    rawGame: g,
  }
}

/** True when game has multiplayer modes but zero single-player modes. */
export function detectSolelyMultiplayer(detail: CatalogGameDetail | null | undefined): boolean {
  if (!detail?.gameModes || detail.gameModes.length === 0) return false
  const modes = detail.gameModes.map(m => m.gameMode.slug)
  const hasSinglePlayer = modes.includes('single-player')
  const hasMultiplayer = modes.some(slug =>
    slug.includes('multiplayer') ||
    slug.includes('co-op') ||
    slug.includes('co-operative') ||
    slug.includes('mmo') ||
    slug.includes('battle-royale')
  )
  return hasMultiplayer && !hasSinglePlayer
}
