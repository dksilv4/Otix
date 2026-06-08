import { useState, useEffect } from 'react'
import { getDesktopAPI } from '@/lib/desktop-api'

export interface PlaytimeInfo {
  totalMinutes: number
  sessionCount: number
  lastPlayed: number | null
}

export function useGamePlaytime(gameId: string | null | undefined): PlaytimeInfo | null {
  const [playtime, setPlaytime] = useState<PlaytimeInfo | null>(null)

  useEffect(() => {
    setPlaytime(null)
    if (!gameId) return
    const api = getDesktopAPI()
    if (!api?.getPlaytimeForGame) return
    api.getPlaytimeForGame(gameId).then(setPlaytime).catch(() => setPlaytime(null))
  }, [gameId])

  return playtime
}
