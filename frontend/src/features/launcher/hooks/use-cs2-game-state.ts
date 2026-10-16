import { useState, useEffect } from 'react'
import type { Cs2LiveState } from '@/lib/desktop/api'

export interface UseCs2GameStateOptions {
  enabled?: boolean
}

// ── Web (browser) fallback: shared singleton poller with circuit breaker ──

const cs2WebSubscribers = new Set<() => void>()
let cs2WebState: Cs2LiveState | null = null
let cs2ConsecutiveFailures = 0
let cs2PollTimer: ReturnType<typeof setTimeout> | null = null
let cs2LastCheckTime = 0
let cs2IsActive = false

const notifyCs2WebSubscribers = () => {
  cs2WebSubscribers.forEach((fn) => fn())
}

const areCs2StatesEqual = (a: Cs2LiveState | null, b: Cs2LiveState | null): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.timestamp === b.timestamp &&
    a.map?.name === b.map?.name &&
    a.map?.phase === b.map?.phase &&
    a.player?.kills === b.player?.kills &&
    a.player?.deaths === b.player?.deaths &&
    a.round?.bomb === b.round?.bomb
  )
}

const scheduleNextCs2Poll = () => {
  if (cs2PollTimer !== null) {
    clearTimeout(cs2PollTimer)
    cs2PollTimer = null
  }
  if (!cs2IsActive || cs2WebSubscribers.size === 0) return

  // Adaptive backoff:
  // CS2 bridge online (0 failures): poll every 1s
  // 1 failure: retry in 5s
  // 2 failures: retry in 15s
  // 3+ failures: stop continuous polling timer; only re-check on tab focus
  let delayMs = 1000
  if (cs2ConsecutiveFailures === 1) {
    delayMs = 5000
  } else if (cs2ConsecutiveFailures === 2) {
    delayMs = 15000
  } else if (cs2ConsecutiveFailures >= 3) {
    return
  }

  cs2PollTimer = setTimeout(() => {
    void executeCs2WebCheck()
  }, delayMs)
}

const executeCs2WebCheck = async (force = false) => {
  if (!cs2IsActive && !force) return

  const now = Date.now()
  if (!force && now - cs2LastCheckTime < 800) return
  cs2LastCheckTime = now

  try {
    const host = typeof window !== 'undefined' ? (window.location.hostname || '127.0.0.1') : '127.0.0.1'
    const res = await fetch(`http://${host}:5000/api/cs2-gsi/state`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json()
    cs2ConsecutiveFailures = 0

    let nextState: Cs2LiveState | null = null
    if (data && typeof data === 'object' && data.timestamp) {
      if (Date.now() - data.timestamp <= 20000) {
        nextState = data as Cs2LiveState
      }
    }

    if (!areCs2StatesEqual(cs2WebState, nextState)) {
      cs2WebState = nextState
      notifyCs2WebSubscribers()
    }
  } catch {
    cs2ConsecutiveFailures += 1
    if (cs2WebState !== null) {
      cs2WebState = null
      notifyCs2WebSubscribers()
    }
  } finally {
    scheduleNextCs2Poll()
  }
}

const onCs2WindowFocus = () => {
  if (cs2WebSubscribers.size === 0) return
  const now = Date.now()
  if (now - cs2LastCheckTime >= 15000) {
    cs2ConsecutiveFailures = 0
    void executeCs2WebCheck(true)
  }
}

const subscribeCs2Web = (cb: () => void) => {
  cs2WebSubscribers.add(cb)
  if (cs2WebSubscribers.size === 1) {
    cs2IsActive = true
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onCs2WindowFocus)
    }
    void executeCs2WebCheck(true)
  }
  return () => {
    cs2WebSubscribers.delete(cb)
    if (cs2WebSubscribers.size === 0) {
      cs2IsActive = false
      if (cs2PollTimer !== null) {
        clearTimeout(cs2PollTimer)
        cs2PollTimer = null
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onCs2WindowFocus)
      }
    }
  }
}

export const useCs2GameState = (options?: UseCs2GameStateOptions) => {
  const enabled = options?.enabled ?? true
  const isDesktopEnv = typeof window !== 'undefined' && Boolean(window.desktopAPI)
  const [gameState, setGameState] = useState<Cs2LiveState | null>(() => {
    return isDesktopEnv ? null : cs2WebState
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) {
      setGameState(null)
      return
    }

    if (isDesktopEnv && window.desktopAPI) {
      if (window.desktopAPI.getCs2GameState) {
        window.desktopAPI
          .getCs2GameState()
          .then((state) => {
            if (state) setGameState(state)
          })
          .catch(() => {})
      }

      if (window.desktopAPI.onCs2StateUpdate) {
        const unsub = window.desktopAPI.onCs2StateUpdate((state) => {
          setGameState(state)
        })
        return () => {
          unsub()
        }
      }
      return
    }

    // Web / Standalone mode: subscribe to shared poller with adaptive backoff
    const unsubscribe = subscribeCs2Web(() => {
      setGameState(cs2WebState)
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, isDesktopEnv])

  return {
    gameState,
    isCs2Active: gameState !== null,
  }
}
