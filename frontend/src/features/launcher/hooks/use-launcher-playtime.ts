import { useState, useEffect, useCallback } from 'react'
import { getDesktopAPI, type PlaytimeInfo } from '@/lib/desktop/api'

export function useGamePlaytime(gameId: string | null | undefined): PlaytimeInfo | null {
  const [playtime, setPlaytime] = useState<PlaytimeInfo | null>(null)

  const fetchPlaytime = useCallback(() => {
    if (!gameId) return
    const api = getDesktopAPI()
    if (api?.getPlaytimeForGame) {
      api.getPlaytimeForGame(gameId).then(setPlaytime).catch(() => setPlaytime(null))
      return
    }

    // Fallback to Otix Node
    fetch(`http://127.0.0.1:8090/api/v1/games/playtime/${encodeURIComponent(gameId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setPlaytime({
          totalMinutes: data.total_minutes || 0,
          sessionCount: data.session_count || 0,
          lastPlayed: data.last_played ? new Date(data.last_played).getTime() : null,
          lastFpsStats: data.last_fps_stats ? {
            avgFps: data.last_fps_stats.avg_fps || 0,
            onePercentLow: data.last_fps_stats.low_1_percent || 0,
            zeroPointOnePercentLow: data.last_fps_stats.low_01_percent || 0,
            maxFps: data.last_fps_stats.max_fps || 0,
            minFps: data.last_fps_stats.min_fps || 0,
            totalFrames: data.last_fps_stats.total_frames || 0,
            captureDurationMs: (data.last_fps_stats.duration_seconds || 0) * 1000,
          } : null,
        })
      })
      .catch(() => setPlaytime(null))
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
