import { useState, useEffect, useCallback, useRef } from 'react'
import type { RunningGameData } from '@/lib/desktop/api'

// ── Web (browser) fallback: shared singleton poller with circuit breaker ──

const webSubscribers = new Set<() => void>()
let webRunningGames: RunningGameData[] = []
let webConsecutiveFailures = 0
let webPollTimer: ReturnType<typeof setTimeout> | null = null
let webLastCheckTime = 0
let webIsActive = false

const parseNodeGames = (data: any): RunningGameData[] => {
  if (!data?.running || (!data?.games?.length && !data?.game)) {
    return []
  }
  const rawList: any[] = Array.isArray(data.games) && data.games.length > 0
    ? data.games
    : (data.game ? [data.game] : [])

  return rawList.map((g) => {
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
}

const notifyWebSubscribers = () => {
  webSubscribers.forEach((fn) => fn())
}

const scheduleNextPoll = () => {
  if (webPollTimer !== null) {
    clearTimeout(webPollTimer)
    webPollTimer = null
  }
  if (!webIsActive || webSubscribers.size === 0) return

  // Adaptive backoff:
  // Node online (0 failures): poll every 3s
  // 1 failure: retry in 15s
  // 2 failures: retry in 60s
  // 3+ failures: stop continuous polling timer; only re-check on tab focus
  let delayMs = 3000
  if (webConsecutiveFailures === 1) {
    delayMs = 15000
  } else if (webConsecutiveFailures === 2) {
    delayMs = 60000
  } else if (webConsecutiveFailures >= 3) {
    return
  }

  webPollTimer = setTimeout(() => {
    void executeWebCheck()
  }, delayMs)
}

const executeWebCheck = async (force = false) => {
  if (!webIsActive && !force) return
  const now = Date.now()
  if (!force && now - webLastCheckTime < 2000) return
  webLastCheckTime = now

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1500)
    const res = await fetch('http://127.0.0.1:8090/api/v1/games/running', {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error(`Node HTTP ${res.status}`)
    }

    const data = await res.json()
    webConsecutiveFailures = 0
    webRunningGames = parseNodeGames(data)
    notifyWebSubscribers()
  } catch {
    webConsecutiveFailures += 1
    if (webRunningGames.length > 0) {
      webRunningGames = []
      notifyWebSubscribers()
    }
  } finally {
    scheduleNextPoll()
  }
}

const onWindowFocus = () => {
  if (webSubscribers.size === 0) return
  const now = Date.now()
  if (now - webLastCheckTime >= 30000) {
    void executeWebCheck(true)
  }
}

const subscribeWeb = (cb: () => void) => {
  webSubscribers.add(cb)
  if (webSubscribers.size === 1) {
    webIsActive = true
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onWindowFocus)
    }
    void executeWebCheck(true)
  }
  return () => {
    webSubscribers.delete(cb)
    if (webSubscribers.size === 0) {
      webIsActive = false
      if (webPollTimer !== null) {
        clearTimeout(webPollTimer)
        webPollTimer = null
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus)
      }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

export const useRunningGame = () => {
  const isDesktopEnv = typeof window !== 'undefined' && Boolean(window.desktopAPI)
  const [runningGames, setRunningGames] = useState<RunningGameData[]>(() => {
    return isDesktopEnv ? [] : webRunningGames
  })
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

  // Synchronize elapsed timer with current runningGames
  useEffect(() => {
    if (runningGames.length > 0) {
      startTimer(runningGames[0].startTime)
    } else {
      clearTimer()
      setElapsedMs(0)
    }
  }, [runningGames, startTimer, clearTimer])

  // Subscribe to game detection events
  useEffect(() => {
    if (isDesktopEnv && window.desktopAPI) {
      const api = window.desktopAPI
      // Check if games are already running
      const initGames = async () => {
        try {
          if (api.getRunningGames) {
            const list = await api.getRunningGames()
            if (Array.isArray(list) && list.length > 0) {
              setRunningGames(list)
              return
            }
          }
          const single = await api.getRunningGame()
          if (single) {
            setRunningGames([single])
          } else {
            setRunningGames([])
          }
        } catch {
          // ignore
        }
      }
      void initGames()

      // Listen for game started
      const unsubStart = api.onGameStarted((data: RunningGameData) => {
        setRunningGames((prev) => [data, ...prev.filter((g) => g.game.id !== data.game.id)])
      })

      // Listen for game ended
      const unsubEnd = api.onGameEnded((data?: { gameId?: string; gameTitle?: string }) => {
        setRunningGames((prev) => {
          if (data?.gameId) {
            return prev.filter((g) => g.game.id !== data.gameId)
          }
          return []
        })
      })

      // Listen for live FPS updates
      const unsubFps = api.onFpsUpdate?.((data) => {
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

    // Web fallback: subscribe to shared singleton poller
    const unsubscribe = subscribeWeb(() => {
      setRunningGames([...webRunningGames])
    })

    return () => {
      unsubscribe()
      clearTimer()
    }
  }, [isDesktopEnv, clearTimer])

  const runningGame = runningGames[0] ?? null

  return { runningGame, runningGames, elapsedMs }
}
