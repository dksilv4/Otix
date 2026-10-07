import { useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { showXPToast } from '@/components/ui/atoms/xp-toast'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useRunningGame } from '../../hooks/use-running-game'
import {
  setGamingSessionState,
  resetGamingSessionState,
  getGamingSessionState,
} from '../../utils/gaming-xp-store'

interface HeartbeatResponse {
  status: string
  xpAwarded: number
  totalXp: number
  level: number
  levelTitle: string
  sessionXp: number
  dailyXp: number
}

/** Headless host component that tracks active gaming duration and awards session XP at the end of the session. */
export const GamingXpHost = () => {
  const { runningGame, elapsedMs } = useRunningGame()
  const { user } = useAuth()

  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  })

  // Track session details
  const sessionRef = useRef<{
    gameId: string
    gameTitle: string
    startTime: number
    lastAwardedSeconds: number
    isRequestInFlight: boolean
  } | null>(null)

  // 1. Live session XP calculation & periodic heartbeat while game is running
  useEffect(() => {
    if (!runningGame || !userRef.current) return

    const gameId = runningGame.game.id
    const gameTitle = runningGame.game.title
    const startTime = runningGame.startTime
    const durationSeconds = Math.floor(elapsedMs / 1000)
    // 1 XP per minute (60 seconds)
    const liveSessionXp = Math.floor(durationSeconds / 60)

    if (!sessionRef.current || sessionRef.current.gameId !== gameId || sessionRef.current.startTime !== startTime) {
      sessionRef.current = {
        gameId,
        gameTitle,
        startTime,
        lastAwardedSeconds: 0,
        isRequestInFlight: false,
      }
      setGamingSessionState({
        isGaming: true,
        currentGameId: gameId,
        currentGameTitle: gameTitle,
        sessionXp: liveSessionXp,
      })
    } else {
      // Keep live XP in sync with elapsed time (1 XP per minute)
      const currentStoreState = getGamingSessionState()
      if (currentStoreState.sessionXp !== liveSessionXp) {
        setGamingSessionState({
          sessionXp: liveSessionXp,
        })
      }
    }

    const session = sessionRef.current
    if (session.isRequestInFlight) return

    // Periodic heartbeat every 5 minutes (300s) to keep server session cached
    const nextTick = session.lastAwardedSeconds + 300
    if (durationSeconds >= nextTick) {
      session.isRequestInFlight = true
      const sessionId = `sess-${gameId}-${startTime}`

      void (async () => {
        try {
          const res = await apiClient.post<HeartbeatResponse>('/users/me/gaming-heartbeat', {
            gameId,
            gameTitle,
            sessionId,
            durationSeconds,
            isFinal: false,
          })
          const data = res?.data
          if (data && data.status === 'ok') {
            session.lastAwardedSeconds = durationSeconds
            if (typeof data.dailyXp === 'number') {
              setGamingSessionState({
                dailyXp: data.dailyXp,
              })
            }
          }
        } catch {
          // ignore network or offline errors
        } finally {
          session.isRequestInFlight = false
        }
      })()
    }
  }, [runningGame, elapsedMs])

  // 2. Final heartbeat when game stops
  const prevRunningGameRef = useRef(runningGame)
  const prevElapsedMsRef = useRef(elapsedMs)
  useEffect(() => {
    if (prevRunningGameRef.current && !runningGame && userRef.current && sessionRef.current) {
      const activeSession = sessionRef.current
      const durationSeconds = Math.floor(prevElapsedMsRef.current / 1000)
      const sessionId = `sess-${activeSession.gameId}-${activeSession.startTime}`

      void (async () => {
        try {
          const res = await apiClient.post<HeartbeatResponse>('/users/me/gaming-heartbeat', {
            gameId: activeSession.gameId,
            gameTitle: activeSession.gameTitle,
            sessionId,
            durationSeconds,
            isFinal: true,
          })
          const data = res?.data
          if (data && data.status === 'ok' && data.xpAwarded > 0) {
            showXPToast(data.xpAwarded, `Gaming: ${activeSession.gameTitle}`, userRef.current?.totalXp)
          }
        } catch {
          // ignore
        } finally {
          resetGamingSessionState()
          sessionRef.current = null
        }
      })()
    }

    prevRunningGameRef.current = runningGame
    prevElapsedMsRef.current = elapsedMs
  }, [runningGame, elapsedMs])

  return null
};
