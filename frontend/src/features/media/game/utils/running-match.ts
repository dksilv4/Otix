import type { RunningGameData } from '@/lib/desktop/api'
import type { LocalGame } from '@/features/launcher/types'
import { isTitleMatch } from '@/features/media/utils'
import { isCs2Game } from '@/features/launcher/utils/cs2-gsi'

export interface MatchRunningGameParams {
  runningGames: RunningGameData[]
  mediaId?: string | null
  mediaTitle?: string | null
  effectiveTitle?: string | null
  matchingScannedGame?: LocalGame | null
}

/**
 * Matches an active running game session to the current media or scanned game.
 */
export const findMatchingRunningGame = ({
  runningGames,
  mediaId,
  mediaTitle,
  effectiveTitle,
  matchingScannedGame,
}: MatchRunningGameParams): RunningGameData | null => {
  if (!runningGames || runningGames.length === 0) return null

  const targetTitles = [effectiveTitle, mediaTitle, matchingScannedGame?.title]
    .filter((t): t is string => Boolean(t && t.trim()))

  const isTargetCs2 =
    targetTitles.some((t) => isCs2Game(t)) ||
    isCs2Game(matchingScannedGame?.exePath) ||
    Boolean(mediaId && (mediaId === '3084' || mediaId === '730'))

  for (const rg of runningGames) {
    // 1. Direct scanned game ID or normalized ID match
    if (matchingScannedGame) {
      if (rg.game.id === matchingScannedGame.id) return rg
      const normRgId = rg.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
      const normScannedId = matchingScannedGame.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
      if (normRgId && normScannedId && normRgId === normScannedId) return rg
      if (
        Boolean(rg.game.exePath && matchingScannedGame.exePath) &&
        (rg.game.exePath ?? '').toLowerCase() === (matchingScannedGame.exePath ?? '').toLowerCase()
      ) {
        return rg
      }
    }

    // 2. otixMediaId or mediaId match
    if (mediaId) {
      const sMediaId = String(mediaId).trim()
      if (rg.game.otixMediaId && String(rg.game.otixMediaId).trim() === sMediaId) return rg
      if (rg.game.id === sMediaId) return rg
    }

    if (matchingScannedGame?.data?.id) {
      const sDataId = String(matchingScannedGame.data.id).trim()
      if (rg.game.otixMediaId && String(rg.game.otixMediaId).trim() === sDataId) return rg
      if (rg.game.id === sDataId) return rg
    }

    if (matchingScannedGame?.otixMediaId) {
      const sOtixId = String(matchingScannedGame.otixMediaId).trim()
      if (rg.game.otixMediaId && String(rg.game.otixMediaId).trim() === sOtixId) return rg
      if (rg.game.id === sOtixId) return rg
    }

    // 3. Counter-Strike 2 specific detection
    if (isTargetCs2) {
      if (
        isCs2Game(rg.game.title) ||
        isCs2Game(rg.game.exePath) ||
        isCs2Game(rg.game.processName) ||
        rg.game.id.toLowerCase().includes('cs2') ||
        rg.game.id === '730' ||
        rg.game.id === 'steam_730' ||
        rg.game.id === 'counter-strike-2'
      ) {
        return rg
      }
    }

    // 4. Title comparison
    const rgTitle = rg.game.title
    if (rgTitle) {
      for (const t of targetTitles) {
        if (
          rgTitle.toLowerCase() === t.toLowerCase() ||
          isTitleMatch(rgTitle, t)
        ) {
          return rg
        }
      }
    }
  }

  return null
}

export interface RunningStatusTextParams {
  platform?: string | null
  cs2Status?: string | null
}

/**
 * Returns clean user-facing status label when game is currently playing.
 */
export const getRunningGameStatusText = ({
  platform,
  cs2Status,
}: RunningStatusTextParams): string => {
  const base = platform === 'steam' ? 'Playing via Steam' : 'Currently playing'
  if (cs2Status && cs2Status !== 'In Game') {
    return `${base} · ${cs2Status}`
  }
  return base
}
