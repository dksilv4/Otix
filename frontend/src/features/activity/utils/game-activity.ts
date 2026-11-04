import type { RunningGameData } from '@/lib/desktop/api'

/**
 * Returns semantic styling classes and label for live FPS rates without hardcoded palettes.
 */
export const formatFpsBadge = (fps: number): { text: string; className: string } => {
  const rounded = Math.round(fps)
  if (rounded <= 0) {
    return { text: '', className: '' }
  }

  const text = `${rounded} FPS`
  if (rounded >= 60) {
    return {
      text,
      className: 'text-primary bg-primary/15 font-bold',
    }
  }
  if (rounded >= 30) {
    return {
      text,
      className: 'text-foreground bg-[var(--dk-surface-ghost)] font-semibold',
    }
  }
  return {
    text,
    className: 'text-muted-foreground bg-[var(--dk-surface-field)] font-medium',
  }
}

/**
 * Returns [currentIndex/totalCount] counter string.
 */
export const formatMultiGameIndex = (currentIndex: number, totalCount: number): string => {
  if (totalCount <= 1) return ''
  return `[${currentIndex + 1}/${totalCount}]`
}

/**
 * Returns background (non-active) running games.
 */
export const getBackgroundRunningGames = (
  games: RunningGameData[],
  activeGameId?: string,
): RunningGameData[] => {
  if (!games || games.length <= 1) return []
  return games.filter((g) => g.game.id !== activeGameId)
}
