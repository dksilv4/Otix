import { useState, useEffect, useCallback, useRef } from 'react'
import type { RunningGameData } from '@/lib/desktop/api'

export function useRunningGame() {
  const [runningGames, setRunningGames] = useState<RunningGameData[]>([])
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
      // Check if games are already running
      const initGames = async () => {
        try {
          if (window.desktopAPI.getRunningGames) {
            const list = await window.desktopAPI.getRunningGames()
            if (Array.isArray(list) && list.length > 0) {
              setRunningGames(list)
              startTimer(list[0].startTime)
              return
            }
          }
          const single = await window.desktopAPI.getRunningGame()
          if (single) {
            setRunningGames([single])
            startTimer(single.startTime)
          } else {
            setRunningGames([])
          }
        } catch {
          // ignore
        }
      }
      void initGames()

      // Listen for game started
      const unsubStart = window.desktopAPI.onGameStarted((data: RunningGameData) => {
        setRunningGames((prev) => {
          const next = [data, ...prev.filter((g) => g.game.id !== data.game.id)]
          return next
        })
        startTimer(data.startTime)
      })

      // Listen for game ended
      const unsubEnd = window.desktopAPI.onGameEnded((data?: { gameId?: string; gameTitle?: string }) => {
        setRunningGames((prev) => {
          if (data?.gameId) {
            const remaining = prev.filter((g) => g.game.id !== data.gameId)
            if (remaining.length === 0) {
              clearTimer()
              setElapsedMs(0)
            } else {
              startTimer(remaining[0].startTime)
            }
            return remaining
          }
          clearTimer()
          setElapsedMs(0)
          return []
        })
      })

      // Listen for live FPS updates
      const unsubFps = window.desktopAPI.onFpsUpdate?.((data) => {
        setRunningGames((prev) => {
          if (prev.length === 0) return prev
          return prev.map((g, index) => {
            if (data?.gameId ? g.game.id === data.gameId : index === 0) {
              return {
                ...g,
                fpsSnapshot: data,
              }
            }
            return g
          })
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

        if (data?.running && (data?.games?.length || data?.game)) {
          const rawList: any[] = Array.isArray(data.games) && data.games.length > 0
            ? data.games
            : (data.game ? [data.game] : [])

          const parsedGames: RunningGameData[] = rawList.map((g) => {
            const rawStart = new Date(g.start_time).getTime()
            const elapsedFallback = Date.now() - ((g.current_duration_seconds || 0) * 1000)
            const startTime = rawStart || elapsedFallback
            return {
              game: {
                id: g.id,
                title: g.title,
                platform: 'pc',
                exePath: g.exe_path,
                processName: g.process_name,
                otixMediaId: g.otix_media_id,
                posterUrl: g.poster_url,
                backdropUrl: g.backdrop_url,
              },
              startTime,
              launchedByOtix: false,
              pid: g.pid,
              fpsAvailable: g.fps_available,
              fpsSnapshot: g.fps_snapshot ? {
                currentFps: g.fps_snapshot.fps,
                frameCount: g.fps_snapshot.frame_count || 0,
                captureDurationMs: 0,
                gameId: g.id,
              } : null,
            }
          })

          setRunningGames(parsedGames)
          if (parsedGames.length > 0) {
            startTimer(parsedGames[0].startTime)
          }
        } else {
          setRunningGames((prev) => {
            if (prev.length > 0) {
              clearTimer()
              setElapsedMs(0)
            }
            return []
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

  const runningGame = runningGames[0] ?? null

  return { runningGame, runningGames, elapsedMs }
}
