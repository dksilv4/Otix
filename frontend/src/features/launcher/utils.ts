import type { LocalGame, DisplayGame } from './types'
export { heroImage } from '@/lib/utils'

/** Applications (non-game software) are stored but hidden from the launcher UI for now. */
export function isApplicationGame(
  g: { isApp?: boolean; gameType?: string; contentType?: string } | null | undefined,
): boolean {
  return !!g && (g.isApp === true || g.gameType === 'application' || g.contentType === 'application')
}

/** Convert raw LocalGame → DisplayGame for the launcher view. */
export function toDisplayGame(g: LocalGame): DisplayGame {
  const platformLabel = g.platform.toUpperCase()
  const isMatched = !!g.data?.id
  const matchLabel = isMatched ? '✓ Matched' : (g.matchSuggestion ? '⚠ Suggestion' : 'Unmatched')
  return {
    id: g.id,
    title: g.data?.title || g.otixMediaTitle || g.title,
    posterUrl: g.otixPosterUrl || g.data?.posterUrl || g.posterUrl || null,
    textlessPosterUrl: g.otixTextlessPosterUrl || g.data?.textlessPosterUrl || null,
    backdropUrl: g.otixBackdropUrl || g.data?.backdropUrl || undefined,
    localIconUrl: g.localIconUrl || undefined,
    iconUrl: g.data?.iconUrl || g.otixIconUrl || g.iconUrl || undefined,
    logoUrl: g.otixLogoUrl || g.data?.logoUrl || g.logoUrl || undefined,
    logoColorGuess: g.data?.logoColorGuess || undefined,
    badge: `${platformLabel} · ${matchLabel}`,
    playtime: '—',
    achievements: isMatched ? 'Owned' : '—',
    isDefault: false,
    platform: g.platform,
    exePath: g.exePath,
    installDir: g.installDir,
    isInstalled: !!g.exePath && g.platform !== 'iso',
    otixMediaId: g.otixMediaId || g.data?.id || undefined,
    rawGame: g,
  }
}

