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
    if (api?.onFpsUpdate) {
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
    }

    // Fallback: connect to Otix Node live SSE stream directly
    setSnapshot(null)
    setHistory([])

    let es: EventSource | null = null
    try {
      es = new EventSource('http://127.0.0.1:8090/api/v1/games/fps/live')
      es.onerror = () => {
        es?.close()
        es = null
      }
      es.onmessage = (e) => {
        try {
          const snap = JSON.parse(e.data)
          if (snap && snap.fps !== undefined) {
            const data: LiveFpsSnapshot = {
              currentFps: snap.fps,
              frameCount: snap.frame_count || 0,
              captureDurationMs: 0,
              gameId: gameId || '',
            }
            setSnapshot(data)
            if (snap.fps > 0) {
              setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap.fps])
            }
          }
        } catch {
          // ignore malformed SSE messages
        }
      }
    } catch {
      // EventSource failed to instantiate
    }

    return () => {
      if (es) es.close()
      setSnapshot(null)
    }
  }, [gameId])

  return { snapshot, history }
}
