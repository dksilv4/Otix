import { useState, useEffect, useCallback } from 'react'
import { getDesktopAPI, type PlaytimeInfo } from '@/lib/desktop/api'

export const useGamePlaytime = (gameId: string | null | undefined): PlaytimeInfo | null => {
  const [playtime, setPlaytime] = useState<PlaytimeInfo | null>(null)

  const fetchPlaytime = useCallback(() => {
    if (!gameId) return
    const api = getDesktopAPI()
    if (api?.getPlaytimeForGame) {
      api.getPlaytimeForGame(gameId).then(setPlaytime).catch(() => setPlaytime(null))
    }
  }, [gameId])

  useEffect(() => {
    setPlaytime(null)
    fetchPlaytime()
  }, [fetchPlaytime])

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api) return

    const unsubEnded = api.onGameEnded?.((data) => {
      if (!gameId || data?.gameId === gameId || data?.gameTitle) {
        fetchPlaytime()
      }
    })

    const unsubFpsStats = api.onFpsStats?.((data) => {
      if (!gameId || data?.gameId === gameId) {
        fetchPlaytime()
      }
    })

    const unsubUpdated = api.onSessionsUpdated?.((data) => {
      if (!gameId || data?.gameId === gameId || !data) {
        fetchPlaytime()
      }
    })

    return () => {
      unsubEnded?.()
      unsubFpsStats?.()
      unsubUpdated?.()
    }
  }, [gameId, fetchPlaytime])

  return playtime
}
