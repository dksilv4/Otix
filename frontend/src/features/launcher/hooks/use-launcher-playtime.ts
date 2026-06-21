import { useState, useEffect, useCallback } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import type { FpsStatsData } from '@/lib/desktop/api'

export interface PlaytimeInfo {
  totalMinutes: number
  sessionCount: number
  lastPlayed: number | null
  lastFpsStats: FpsStatsData | null
}

export function useGamePlaytime(gameId: string | null | undefined): PlaytimeInfo | null {
  const [playtime, setPlaytime] = useState<PlaytimeInfo | null>(null)

  const fetchPlaytime = useCallback(() => {
    if (!gameId) return
    const api = getDesktopAPI()
    if (!api?.getPlaytimeForGame) return
    api.getPlaytimeForGame(gameId).then(setPlaytime).catch(() => setPlaytime(null))
  }, [gameId])

  useEffect(() => {
    setPlaytime(null)
    fetchPlaytime()
  }, [fetchPlaytime])

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api?.onGameEnded) return
    const unsub = api.onGameEnded((data) => {
      if (data?.gameId === gameId || data?.gameTitle) {
        fetchPlaytime()
      }
    })
    return unsub
  }, [gameId, fetchPlaytime])

  return playtime
}
