import { useState, useEffect, useRef, useCallback } from 'react'
import { getDesktopAPI } from '@/lib/desktop-api'
import type { LiveFpsSnapshot } from '@/lib/desktop-api'

const MAX_HISTORY = 60

export interface LiveFpsData {
  snapshot: LiveFpsSnapshot | null
  history: number[] // rolling FPS values for sparkline
}

export const useLiveFps = (gameId?: string): LiveFpsData => {
  const [snapshot, setSnapshot] = useState<LiveFpsSnapshot | null>(null)
  const historyRef = useRef<number[]>([])

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api?.onFpsUpdate) return

    setSnapshot(null)
    historyRef.current = []

    const unsub = api.onFpsUpdate((data) => {
      if (gameId && data.gameId !== gameId) return // not our game
      setSnapshot(data)
      if (data.currentFps > 0) {
        historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), data.currentFps]
      }
    })

    return () => {
      unsub()
      setSnapshot(null)
    }
  }, [gameId])

  return { snapshot, history: historyRef.current }
}
