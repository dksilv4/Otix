export interface GamingSessionXpState {
  sessionXp: number
  dailyXp: number
  currentGameId: string | null
  currentGameTitle: string | null
  isGaming: boolean
}

let currentState: GamingSessionXpState = {
  sessionXp: 0,
  dailyXp: 0,
  currentGameId: null,
  currentGameTitle: null,
  isGaming: false,
}

type Listener = (state: GamingSessionXpState) => void
const listeners = new Set<Listener>()

export const getGamingSessionState = (): GamingSessionXpState => currentState

export const setGamingSessionState = (partial: Partial<GamingSessionXpState>): void => {
  currentState = { ...currentState, ...partial }
  listeners.forEach((listener) => {
    try {
      listener(currentState)
    } catch {
      // ignore listener error
    }
  })
}

export const resetGamingSessionState = (): void => {
  setGamingSessionState({
    sessionXp: 0,
    currentGameId: null,
    currentGameTitle: null,
    isGaming: false,
  })
}

export const subscribeGamingSessionState = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
