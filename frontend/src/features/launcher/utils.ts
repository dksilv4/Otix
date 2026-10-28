import type { LocalGame, DisplayGame } from './types'
import { getScanPaths } from '@/features/launcher/data/storage'
export { heroImage } from '@/lib/utils'

export type LauncherCardGame = LocalGame | DisplayGame

/** Applications (non-game software) are stored but hidden from the launcher UI for now. */
export const isApplicationGame = (
  g: unknown,
): boolean => {
  const item = g as { isApp?: boolean; gameType?: string; contentType?: string } | null | undefined
  return !!item && (item.isApp === true || item.gameType === 'application' || item.contentType === 'application')
}

/** Convert raw LocalGame → DisplayGame for the launcher view. */
export const toDisplayGame = (g: LocalGame): DisplayGame => {
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

export { getErrorMessage } from '@/lib/utils/format-error'
export { formatBytes } from '@/lib/utils/format-bytes'

export const driveLetter = (drive: string): string => {
  return drive.endsWith('\\') || drive.endsWith('/') ? drive.slice(0, -1) : drive
}

export const formatPlaytime = (
  playtime: { totalMinutes: number } | null,
  steamPlaytime: number | null | undefined,
): string => {
  if (steamPlaytime != null) {
    const hours = Math.round(steamPlaytime / 60)
    const mins = steamPlaytime % 60
    return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
  }
  if (playtime && playtime.totalMinutes > 0) {
    const hours = Math.floor(playtime.totalMinutes / 60)
    const mins = playtime.totalMinutes % 60
    return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
  }
  return '—'
}

export const extractDrive = (path: string): string => {
  const win = path.match(/^([A-Za-z]:)/)
  if (win) return win[1]
  const unc = path.match(/^(\\\\[^\\]+\\[^\\]+)/)
  if (unc) return unc[1]
  const unix = path.match(/^(\/[^/]+\/[^/]+)/)
  if (unix) return unix[1]
  return ''
}

export const formatTimeToBeat = (ttb: Record<string, unknown> | undefined): string | null => {
  if (!ttb) return null
  const main = ttb.mainStory as number | undefined
  const extras = ttb.mainPlusExtras as number | undefined
  const comp = ttb.completionist as number | undefined
  if (main && extras) return `${Math.round(main / 3600)}h`
  if (main) return `${Math.round(main / 3600)}h`
  if (extras) return `${Math.round(extras / 3600)}h`
  if (comp) return `${Math.round(comp / 3600)}h`
  return null
}

export const asLocal = (game: LauncherCardGame): LocalGame | null => {
  if ('rawGame' in game && game.rawGame) return game.rawGame
  if ('exePath' in game && 'installDir' in game && 'platform' in game) return game
  return null
}

export const launcherMediaCardProps = (game: LauncherCardGame) => {
  const raw = asLocal(game)
  const data = raw?.data
  const display = game as DisplayGame
  const textless = raw?.otixTextlessPosterUrl || data?.textlessPosterUrl || display.textlessPosterUrl || null
  const backdrop = raw?.otixBackdropUrl || data?.backdropUrl || display.backdropUrl || null
  const poster = raw?.otixPosterUrl || data?.posterUrl || raw?.posterUrl || display.posterUrl || null
  const hasCleanArt = Boolean(textless || backdrop)
  const logo = hasCleanArt
    ? (raw?.otixLogoUrl || data?.logoUrl || display.logoUrl || null)
    : null

  return {
    id: raw?.otixMediaId || data?.id || display.otixMediaId || game.id,
    title: data?.title || raw?.otixMediaTitle || game.title,
    posterUrl: poster,
    textlessPosterUrl: textless || backdrop || poster,
    backdropUrl: backdrop,
    logoUrl: logo,
    logoColorGuess: data?.logoColorGuess ?? display.logoColorGuess ?? null,
    avgRating: data?.avgRating ?? null,
    ratingCount: data?.ratingCount,
    releaseDate: data?.releaseDate ?? null,
  }
}

/** Clean a title string by removing scene group tags and normalizing. */
export const cleanTitle = (raw: string): string => {
  return raw
    .replace(/\.iso$/i, '')
    .replace(/[._-]/g, ' ')
    .replace(/\b(repack|elamigos|fitgirl|dodi|codex|flt|plaza|skidrow|rune|tenoke|goldberg|razor1911|fairlight|hoodlum|hbg|multi\d*|voices\d*)\b/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bv\d+(\.\d+)*\b/gi, '')
    .replace(/\bbuild\s*\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Suggest a default install directory — prefer configured games installation folder, then first game library folder, fall back to ISO dir. */
export const suggestInstallDir = (isoPath: string, gameTitle: string): string => {
  let base: string
  try {
    base = localStorage.getItem('otix:games-install-dir') || ''
  } catch {
    base = ''
  }
  if (!base) {
    const dirs = getScanPaths()
    base = dirs.length > 0 ? dirs[0] : isoPath.replace(/[/\\][^/\\]+$/, '')
  }
  const clean = gameTitle.replace(/[<>:"|?*]/g, '').trim()
  return clean ? `${base}/${clean}` : base
}

export const formatElapsed = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
