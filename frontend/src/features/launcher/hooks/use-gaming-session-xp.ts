import { useSyncExternalStore } from 'react'
import {
  getGamingSessionState,
  subscribeGamingSessionState,
  type GamingSessionXpState,
} from '../utils/gaming-xp-store'

export function useGamingSessionXp(): GamingSessionXpState {
  return useSyncExternalStore(
    subscribeGamingSessionState,
    getGamingSessionState,
    getGamingSessionState,
  )
}
