import { useState, useEffect, useCallback, useRef } from 'react'

export interface RunningGameData {
  game: {
    id: string
    title: string
    platform: string
    iconUrl?: string
    posterUrl?: string | null
    exePath?: string
    installDir?: string
    otixMediaId?: string
    otixMediaTitle?: string
  }
  startTime: number
  launchedByOtix: boolean
  pid?: number
}

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
    if (!window.desktopAPI) return

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

    return () => {
      unsubStart()
      unsubEnd()
      clearTimer()
    }
  }, [startTimer, clearTimer])

  return { runningGame, elapsedMs }
}
