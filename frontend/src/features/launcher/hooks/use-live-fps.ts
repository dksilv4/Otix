import { useState, useEffect } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import type { LiveFpsSnapshot } from '@/lib/desktop/api'

const MAX_HISTORY = 60

export interface LiveFpsData {
  snapshot: LiveFpsSnapshot | null
  history: number[]
}

export const useLiveFps = (gameId?: string): LiveFpsData => {
  const [snapshot, setSnapshot] = useState<LiveFpsSnapshot | null>(null)
  const [history, setHistory] = useState<number[]>([])

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api?.onFpsUpdate) {
      setSnapshot(null)
      setHistory([])
      return
    }

    setSnapshot(null)
    setHistory([])

    const unsub = api.onFpsUpdate((data) => {
      if (gameId && data.gameId !== gameId) return
      setSnapshot(data)
      if (data.currentFps > 0) {
        setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), data.currentFps])
      }
    })

    return () => {
      unsub()
      setSnapshot(null)
    }
  }, [gameId])

  return { snapshot, history }
}
