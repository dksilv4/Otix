import { useContext, useSyncExternalStore } from 'react'
import { PlayerProgressContext, playerProgressStore } from './player-context'
import type { PlayerProgressContextValue } from './types'

export const usePlayerProgress = (): PlayerProgressContextValue => {
  const contextProgress = useContext(PlayerProgressContext)
  const storeProgress = useSyncExternalStore(
    playerProgressStore.subscribe,
    playerProgressStore.getProgress,
    playerProgressStore.getProgress,
  )

  if (storeProgress.position > 0 || storeProgress.duration > 0) {
    return storeProgress
  }
  return contextProgress
}
