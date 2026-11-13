import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@ui/molecules/toast'
import { useRunningGame } from '@/features/launcher/hooks/use-running-game'
import { useCs2GameState } from '@/features/launcher/hooks/use-cs2-game-state'
import { formatCs2Status, isCs2Game } from '@/features/launcher/utils/cs2-gsi'
import { formatElapsed } from '@/features/launcher/utils'
import type { LocalGame } from '@/features/launcher/types'
import { findMatchingRunningGame, getRunningGameStatusText } from '../utils/running-match'

export interface UseMediaRunningGameParams {
  mediaId?: string | null
  mediaTitle?: string | null
  effectiveTitle?: string | null
  matchingScannedGame?: LocalGame | null
}

export const useMediaRunningGame = ({
  mediaId,
  mediaTitle,
  effectiveTitle,
  matchingScannedGame,
}: UseMediaRunningGameParams) => {
  const { toast } = useToast()
  const { runningGames, elapsedMs: defaultElapsedMs } = useRunningGame()

  const matchingRunningGame = useMemo(() => {
    return findMatchingRunningGame({
      runningGames,
      mediaId,
      mediaTitle,
      effectiveTitle,
      matchingScannedGame,
    })
  }, [runningGames, mediaId, mediaTitle, effectiveTitle, matchingScannedGame])

  const isRunning = Boolean(matchingRunningGame)

  // Track elapsed time for this specific game session
  const [customElapsedMs, setCustomElapsedMs] = useState<number>(() => {
    if (!matchingRunningGame?.startTime) return defaultElapsedMs
    return Math.max(0, Date.now() - matchingRunningGame.startTime)
  })

  useEffect(() => {
    if (!matchingRunningGame?.startTime) {
      setCustomElapsedMs(defaultElapsedMs)
      return
    }
    const update = () => {
      setCustomElapsedMs(Math.max(0, Date.now() - matchingRunningGame.startTime))
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [matchingRunningGame?.startTime, defaultElapsedMs])

  const elapsedMs = matchingRunningGame?.startTime ? customElapsedMs : defaultElapsedMs

  // CS2 live telemetry if active
  const isCs2 = Boolean(
    isCs2Game(effectiveTitle) ||
    isCs2Game(mediaTitle) ||
    isCs2Game(matchingScannedGame?.title) ||
    isCs2Game(matchingScannedGame?.exePath) ||
    isCs2Game(matchingRunningGame?.game.title) ||
    isCs2Game(matchingRunningGame?.game.exePath) ||
    isCs2Game(matchingRunningGame?.game.processName) ||
    (mediaId === '3084' || mediaId === '730'),
  )

  const { gameState: cs2State } = useCs2GameState({ enabled: isCs2 && isRunning })
  const cs2Status = isCs2 && isRunning ? formatCs2Status(cs2State) : null

  const displayPlatform = matchingScannedGame?.platform || matchingRunningGame?.game.platform
  const statusText = getRunningGameStatusText({
    platform: displayPlatform,
    cs2Status,
  })

  const displayTitle = effectiveTitle || mediaTitle || matchingRunningGame?.game.title || 'Game'

  const handleRunningClick = useCallback(() => {
    toast({
      title: 'Game Active',
      description: `${displayTitle} is already running (${formatElapsed(elapsedMs)} elapsed).`,
      variant: 'default',
    })
  }, [displayTitle, elapsedMs, toast])

  return {
    matchingRunningGame,
    isRunning,
    elapsedMs,
    statusText,
    handleRunningClick,
  }
}
