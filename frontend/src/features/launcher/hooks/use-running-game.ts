import { useState, useEffect, useCallback, useRef } from 'react'
import type { RunningGameData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { hasAccessToken } from '@/lib/config'

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

  const list = rawList.map((g) => {
    const rawStart = new Date(g.startTime || g.start_time || g.startedAt).getTime()
    const duration = g.currentDurationSeconds ?? g.current_duration_seconds ?? 0
    const elapsedFallback = Date.now() - (duration * 1000)
    const startTime = isNaN(rawStart) || rawStart <= 0 ? elapsedFallback : rawStart
    return {
      game: {
        id: g.id || g.game_id || '',
        title: g.title || g.game_title || '',
        platform: g.platform || 'pc',
        exePath: g.exePath || g.exe_path || '',
        processName: g.processName || g.process_name || '',
        otixMediaId: g.otixMediaId ?? g.otix_media_id,
        posterUrl: g.posterUrl || g.poster_url,
        backdropUrl: g.backdropUrl || g.backdrop_url,
      },
      startTime,
      launchedByOtix: Boolean(g.launchedByOtix ?? g.launched_by_otix),
      pid: g.pid || 0,
      fpsAvailable: Boolean(g.fpsAvailable ?? g.fps_available),
      fpsSnapshot: (g.fpsSnapshot || g.fps_snapshot) ? {
        currentFps: (g.fpsSnapshot?.currentFps ?? g.fpsSnapshot?.fps ?? g.fps_snapshot?.current_fps ?? g.fps_snapshot?.fps) ?? 0,
        frameCount: (g.fpsSnapshot?.frameCount ?? g.fps_snapshot?.frame_count) ?? 0,
        captureDurationMs: 0,
        gameId: g.id || g.game_id || '',
      } : null,
    }
  })

  const deduped: RunningGameData[] = []
  const seenPids = new Set<number>()
  const seenIds = new Set<string>()
  for (const g of list) {
    if (g.pid && seenPids.has(g.pid)) continue
    const normId = g.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
    if (normId && seenIds.has(normId)) continue
    if (g.pid) seenPids.add(g.pid)
    if (normId) seenIds.add(normId)
    deduped.push(g)
  }
  return deduped
}

const areRunningGamesEqual = (a: RunningGameData[], b: RunningGameData[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const gA = a[i]
    const gB = b[i]
    if (
      gA.game.id !== gB.game.id ||
      gA.pid !== gB.pid ||
      gA.startTime !== gB.startTime ||
      gA.fpsSnapshot?.currentFps !== gB.fpsSnapshot?.currentFps
    ) {
      return false
    }
  }
  return true
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
  // Node online (0 failures): poll every 3s when game active, 15s when idle
  // 1 failure: retry in 15s
  // 2 failures: retry in 60s
  // 3+ failures: stop continuous polling timer; only re-check on tab focus
  let delayMs = webRunningGames.length > 0 ? 3000 : 15000
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
  if (!hasAccessToken()) {
    if (webRunningGames.length > 0) {
      webRunningGames = []
      notifyWebSubscribers()
    }
    scheduleNextPoll()
    return
  }

  const now = Date.now()
  if (!force && now - webLastCheckTime < 2000) return
  webLastCheckTime = now

  try {
    const { data } = await apiClient.get('/library/game-running', { timeout: 3500 })
    webConsecutiveFailures = 0
    const nextGames = parseNodeGames(data)
    if (!areRunningGamesEqual(webRunningGames, nextGames)) {
      webRunningGames = nextGames
      notifyWebSubscribers()
    }
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
            if (Array.isArray(list)) {
              setRunningGames((prev) => {
                const merged = list.map((item) => {
                  const normItemId = item.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
                  const existing = prev.find((p) => {
                    if (item.pid && p.pid && p.pid === item.pid) return true
                    if (p.game.id === item.game.id) return true
                    if (normItemId && p.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '') === normItemId) return true
                    return false
                  })
                  if (existing && existing.fpsSnapshot && !item.fpsSnapshot) {
                    return { ...item, fpsSnapshot: existing.fpsSnapshot }
                  }
                  return item
                })
                // Deduplicate by PID and normalized game.id
                const deduped: RunningGameData[] = []
                const seenPids = new Set<number>()
                const seenIds = new Set<string>()
                for (const g of merged) {
                  if (g.pid && seenPids.has(g.pid)) continue
                  const normId = g.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
                  if (normId && seenIds.has(normId)) continue
                  if (g.pid) seenPids.add(g.pid)
                  if (normId) seenIds.add(normId)
                  deduped.push(g)
                }
                if (areRunningGamesEqual(prev, deduped)) return prev
                return deduped
              })
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
      const pollTimer = setInterval(() => {
        void initGames()
      }, 15000)
      const onFocus = () => void initGames()
      window.addEventListener('focus', onFocus)

      // Listen for game started
      const unsubStart = api.onGameStarted((data: RunningGameData) => {
        const normDataId = data.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '')
        setRunningGames((prev) => [
          data,
          ...prev.filter((g) => {
            if (g.game.id === data.game.id) return false
            if (data.pid && g.pid && g.pid === data.pid) return false
            if (normDataId && g.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '') === normDataId) return false
            return true
          }),
        ])
      })

      // Listen for game ended
      const unsubEnd = api.onGameEnded((data?: { gameId?: string; gameTitle?: string }) => {
        setRunningGames((prev) => {
          if (data?.gameId) {
            const normEndedId = data.gameId.replace(/^(pc_|file_|iso_|steam_)+/, '')
            return prev.filter((g) => {
              if (g.game.id === data.gameId) return false
              if (normEndedId && g.game.id.replace(/^(pc_|file_|iso_|steam_)+/, '') === normEndedId) return false
              return true
            })
          }
          return []
        })
      })

      // Listen for live FPS updates
      const unsubFps = api.onFpsUpdate?.((data) => {
        if (!data || !data.gameId) return
        setRunningGames((prev) => {
          if (prev.length === 0) return prev
          let changed = false
          const next = prev.map((g) => {
            const matchesId = Boolean(data.gameId && g.game.id === data.gameId)
            const matchesPid = Boolean(data.pid && g.pid === data.pid)
            if (matchesId || matchesPid) {
              changed = true
              return {
                ...g,
                fpsSnapshot: data,
              }
            }
            return g
          })
          return changed ? next : prev
        })
      })

      return () => {
        clearInterval(pollTimer)
        window.removeEventListener('focus', onFocus)
        unsubStart()
        unsubEnd()
        unsubFps?.()
        clearTimer()
      }
    }

    // Web fallback: subscribe to shared singleton poller
    const unsubscribe = subscribeWeb(() => {
      setRunningGames((prev) => (areRunningGamesEqual(prev, webRunningGames) ? prev : [...webRunningGames]))
    })

    return () => {
      unsubscribe()
      clearTimer()
    }
  }, [isDesktopEnv, clearTimer])

  const hasReportedRunningRef = useRef(false)

  // When in desktop environment, sync running games to the backend so web browsers can display them
  useEffect(() => {
    if (!isDesktopEnv || !hasAccessToken()) return

    const syncToBackend = async () => {
      try {
        if (runningGames.length > 0) {
          hasReportedRunningRef.current = true
          const single = runningGames[0]
          await apiClient.post('/library/game-running', {
            running: true,
            game: {
              id: single.game.id,
              title: single.game.title,
              platform: single.game.platform || 'pc',
              exePath: single.game.exePath || '',
              processName: single.game.processName || '',
              otixMediaId: single.game.otixMediaId,
              posterUrl: single.game.posterUrl,
              backdropUrl: single.game.backdropUrl,
              startTime: single.startTime,
            },
            games: runningGames.map((rg) => ({
              id: rg.game.id,
              title: rg.game.title,
              platform: rg.game.platform || 'pc',
              exePath: rg.game.exePath || '',
              processName: rg.game.processName || '',
              otixMediaId: rg.game.otixMediaId,
              posterUrl: rg.game.posterUrl,
              backdropUrl: rg.game.backdropUrl,
              startTime: rg.startTime,
            })),
          })
        } else if (hasReportedRunningRef.current) {
          hasReportedRunningRef.current = false
          await apiClient.post('/library/game-running', {
            running: false,
            game: null,
            games: [],
          })
        }
      } catch {
        // ignore network error
      }
    }

    void syncToBackend()

    if (runningGames.length > 0) {
      const interval = setInterval(() => {
        void syncToBackend()
      }, 25000)
      return () => clearInterval(interval)
    }
  }, [isDesktopEnv, runningGames])

  const cycleActiveGame = useCallback(async () => {
    if (isDesktopEnv && window.desktopAPI?.cycleActiveGame) {
      const next = await window.desktopAPI.cycleActiveGame()
      if (next) {
        setRunningGames((prev) => {
          const list = [...prev]
          const idx = list.findIndex((g) => g.game.id === next.game.id)
          if (idx > 0) {
            const [item] = list.splice(idx, 1)
            list.unshift(item)
          }
          return list
        })
      }
    } else {
      try {
        await apiClient.post('/library/game-active', { action: 'cycle' })
        void executeWebCheck(true)
      } catch {
        // ignore
      }
    }
  }, [isDesktopEnv])

  const setActiveGame = useCallback(async (gameId: string) => {
    if (isDesktopEnv && window.desktopAPI?.setActiveGame) {
      const active = await window.desktopAPI.setActiveGame(gameId)
      if (active) {
        setRunningGames((prev) => {
          const list = [...prev]
          const idx = list.findIndex((g) => g.game.id === active.game.id)
          if (idx > 0) {
            const [item] = list.splice(idx, 1)
            list.unshift(item)
          }
          return list
        })
      }
    } else {
      try {
        await apiClient.post('/library/game-active', { gameId })
        void executeWebCheck(true)
      } catch {
        // ignore
      }
    }
  }, [isDesktopEnv])

  const runningGame = runningGames[0] ?? null

  return { runningGame, runningGames, elapsedMs, cycleActiveGame, setActiveGame }
}
