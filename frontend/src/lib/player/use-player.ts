import { useContext } from 'react'
import { PlayerContext, defaultPlayerContextValue } from './player-context'
import type { PlayerContextValue } from './types'

export const usePlayer = (): PlayerContextValue => {
  const ctx = useContext(PlayerContext)
  return ctx ?? defaultPlayerContextValue
}

export { PlayerProvider } from './player-provider'
