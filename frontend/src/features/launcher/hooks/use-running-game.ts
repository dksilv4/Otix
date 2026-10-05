import { useState, useEffect, useCallback, useRef } from 'react'
import type { RunningGameData } from '@/lib/desktop/api'

export function useRunningGame() {
  const [runningGame, setRunningGame] = useState<RunningGameData | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback((startTime: number) => {
    startTimeRef.current = startTime
    setElapsedMs(Date.now() - startTime)
    clearTimer()
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 1000)
  }, [clearTimer])

  // Subscribe to game detection events
  useEffect(() => {
    if (typeof window !== 'undefined' && window.desktopAPI) {
      // Check if a game is already running
      window.desktopAPI.getRunningGame().then((game: RunningGameData | null) => {
        if (game) {
          setRunningGame(game)
          startTimer(game.startTime)
        }
      }).catch(() => {})

      // Listen for game started
      const unsubStart = window.desktopAPI.onGameStarted((data: RunningGameData) => {
        setRunningGame(data)
        startTimer(data.startTime)
      })

      // Listen for game ended
      const unsubEnd = window.desktopAPI.onGameEnded(() => {
        setRunningGame(null)
        clearTimer()
        setElapsedMs(0)
      })

      // Listen for live FPS updates
      const unsubFps = window.desktopAPI.onFpsUpdate?.((data) => {
        setRunningGame((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            fpsSnapshot: data,
          }
        })
      })

      return () => {
        unsubStart()
        unsubEnd()
        unsubFps?.()
        clearTimer()
      }
    }

    // Fallback: Poll Otix Node (Go daemon) directly when running in browser or standalone node
    let active = true
    const checkNode = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8090/api/v1/games/running')
        if (!res.ok) return
        const data = await res.json()
        if (!active) return

        if (data?.running && data?.game) {
          const rawStart = new Date(data.game.start_time).getTime()
          const elapsedFallback = Date.now() - (data.game.current_duration_seconds * 1000)
          const startTime = rawStart || elapsedFallback
          setRunningGame({
            game: {
              id: data.game.id,
              title: data.game.title,
              platform: 'pc',
              exePath: data.game.exe_path,
              processName: data.game.process_name,
              otixMediaId: data.game.otix_media_id,
              posterUrl: data.game.poster_url,
              backdropUrl: data.game.backdrop_url,
            },
            startTime,
            launchedByOtix: false,
            pid: data.game.pid,
            fpsAvailable: data.game.fps_available,
            fpsSnapshot: data.game.fps_snapshot ? {
              currentFps: data.game.fps_snapshot.fps,
              frameCount: data.game.fps_snapshot.frame_count || 0,
              captureDurationMs: 0,
              gameId: data.game.id,
            } : null,
          })
          startTimer(startTime)
        } else {
          setRunningGame((prev) => {
            if (prev) {
              clearTimer()
              setElapsedMs(0)
            }
            return null
          })
        }
      } catch {
        // Node offline or unreachable
      }
    }

    checkNode()
    const pollId = setInterval(checkNode, 3000)

    return () => {
      active = false
      clearInterval(pollId)
      clearTimer()
    }
  }, [startTimer, clearTimer])

  return { runningGame, elapsedMs }
}
