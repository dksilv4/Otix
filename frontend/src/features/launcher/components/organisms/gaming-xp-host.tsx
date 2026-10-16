import { useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { showXPToast } from '@/components/ui/atoms/xp-toast'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useRunningGame } from '../../hooks/use-running-game'
import { useCs2GameState } from '../../hooks/use-cs2-game-state'
import { isCs2Game } from '../../utils/cs2-gsi'
import {
  setGamingSessionState,
  resetGamingSessionState,
  getGamingSessionState,
} from '../../utils/gaming-xp-store'

interface HeartbeatBreakdown {
  baseXp: number
  completionXp: number
  winXp: number
  kdr: number
  kdrMultiplier: number
  totalCalculated: number
}

interface HeartbeatResponse {
  status: string
  xpAwarded: number
  totalXp: number
  level: number
  levelTitle: string
  sessionXp: number
  dailyXp: number
  breakdown?: HeartbeatBreakdown
}

/** Headless host component that tracks active gaming duration, match outcomes, and awards session XP. */
export const GamingXpHost = () => {
  const { runningGame, elapsedMs } = useRunningGame()
  const isCs2 = Boolean(
    runningGame &&
      isCs2Game(runningGame.game.title || runningGame.game.exePath || runningGame.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2 })
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

  // Track latest match stats
  const matchStatsRef = useRef<{
    kills: number
    deaths: number
    assists: number
    isWin: boolean
    isCompleted: boolean
  }>({ kills: 0, deaths: 0, assists: 0, isWin: false, isCompleted: false })

  const lastAwardedMatchKeyRef = useRef<string | null>(null)

  // Update match stats when gameState updates
  useEffect(() => {
    if (!gameState) return

    const teamUpper = (gameState.team || '').toUpperCase()
    const isWin =
      teamUpper === 'CT'
        ? gameState.scoreCt > gameState.scoreT
        : teamUpper === 'T'
          ? gameState.scoreT > gameState.scoreCt
          : false

    matchStatsRef.current = {
      kills: gameState.kills ?? 0,
      deaths: gameState.deaths ?? 0,
      assists: gameState.assists ?? 0,
      isWin,
      isCompleted: gameState.phase === 'gameover',
    }

    // In-game match completion event (e.g. CS2 match ended)
    if (gameState.phase === 'gameover' && runningGame) {
      const matchKey = `${gameState.mapName || 'map'}-${gameState.round}-${gameState.scoreCt}-${gameState.scoreT}`
      if (lastAwardedMatchKeyRef.current !== matchKey) {
        lastAwardedMatchKeyRef.current = matchKey
        const gameId = runningGame.game.id
        const gameTitle = runningGame.game.title
        const startTime = runningGame.startTime
        const durationSeconds = Math.floor(elapsedMs / 1000)
        const sessionId = `sess-${gameId}-${startTime}`

        void (async () => {
          try {
            const res = await apiClient.post<HeartbeatResponse>('/users/me/gaming-heartbeat', {
              gameId,
              gameTitle,
              sessionId,
              durationSeconds,
              isFinal: false,
              matchCompleted: true,
              matchWon: isWin,
              kills: gameState.kills ?? 0,
              deaths: gameState.deaths ?? 0,
              assists: gameState.assists ?? 0,
            })
            const data = res?.data
            if (data && data.status === 'ok' && data.xpAwarded > 0) {
              let reasonLabel = gameTitle
              if (data.breakdown) {
                const parts: string[] = [gameTitle]
                if (data.breakdown.winXp > 0) parts.push('Victory')
                if (data.breakdown.kdrMultiplier > 1.0) parts.push(`${data.breakdown.kdrMultiplier}x KDR`)
                reasonLabel = parts.join(' · ')
              }
              showXPToast(data.xpAwarded, reasonLabel, userRef.current?.totalXp)
            }
          } catch {
            // ignore
          }
        })()
      }
    }
  }, [gameState, elapsedMs, runningGame])

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
    if (gameState?.phase === 'gameover') return

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
      const latestStats = matchStatsRef.current

      void (async () => {
        try {
          const res = await apiClient.post<HeartbeatResponse>('/users/me/gaming-heartbeat', {
            gameId: activeSession.gameId,
            gameTitle: activeSession.gameTitle,
            sessionId,
            durationSeconds,
            isFinal: true,
            matchCompleted: latestStats.isCompleted || durationSeconds >= 300,
            matchWon: latestStats.isWin,
            kills: latestStats.kills,
            deaths: latestStats.deaths,
            assists: latestStats.assists,
          })
          const data = res?.data
          if (data && data.status === 'ok' && data.xpAwarded > 0) {
            let reasonLabel = activeSession.gameTitle
            if (data.breakdown) {
              const parts: string[] = [activeSession.gameTitle]
              if (data.breakdown.winXp > 0) parts.push('Victory')
              if (data.breakdown.kdrMultiplier > 1.0) parts.push(`${data.breakdown.kdrMultiplier}x KDR`)
              reasonLabel = parts.join(' · ')
            }
            showXPToast(data.xpAwarded, reasonLabel, userRef.current?.totalXp)
          }
        } catch {
          // ignore
        } finally {
          resetGamingSessionState()
          sessionRef.current = null
          lastAwardedMatchKeyRef.current = null
        }
      })()
    }

    prevRunningGameRef.current = runningGame
    prevElapsedMsRef.current = elapsedMs
  }, [runningGame, elapsedMs])

  return null
};
