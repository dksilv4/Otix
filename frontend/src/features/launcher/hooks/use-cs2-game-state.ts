import { useState, useEffect } from 'react'
import type { Cs2LiveState } from '@/lib/desktop/api'

export function useCs2GameState() {
  const [gameState, setGameState] = useState<Cs2LiveState | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.desktopAPI) {
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
    }

    // Fallback: Web / Standalone mode polling Otix Node / GSI local bridge directly
    let active = true
    const pollGsi = async () => {
      try {
        const host = window.location.hostname || '127.0.0.1'
        const res = await fetch(`http://${host}:5000/api/cs2-gsi/state`)
        if (!res.ok) return
        const data = await res.json()
        if (!active) return
        if (data && typeof data === 'object' && data.timestamp) {
          // If state is older than 20s, clear it
          if (Date.now() - data.timestamp > 20000) {
            setGameState(null)
          } else {
            setGameState(data)
          }
        } else {
          setGameState(null)
        }
      } catch {
        // GSI server not reachable or offline
      }
    }

    pollGsi()
    const interval = setInterval(pollGsi, 1000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return {
    gameState,
    isCs2Active: gameState !== null,
  }
}
