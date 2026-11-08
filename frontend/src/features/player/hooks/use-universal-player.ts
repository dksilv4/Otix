import { useContext } from 'react'
import { UniversalPlayerContext } from '../core/universal-player-context'
import type { UniversalPlayerContextValue } from '../types'

export const useUniversalPlayer = (): UniversalPlayerContextValue => {
  const context = useContext(UniversalPlayerContext)
  if (!context) {
    throw new Error('useUniversalPlayer must be used within a UniversalPlayerProvider')
  }
  return context
}
