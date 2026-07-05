import type { LocalGame, DisplayGame } from './types'
export { heroImage } from '@/lib/utils'

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
    logoUrl: g.otixLogoUrl || g.data?.logoUrl || g.logoUrl || undefined,
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

