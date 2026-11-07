import { useContext } from 'react'
import { PlexPlayerContext } from '../player-context'
import type { PlexPlayerContextValue } from '../types'

export const usePlexPlayer = (): PlexPlayerContextValue => {
  const ctx = useContext(PlexPlayerContext)
  if (!ctx) throw new Error('usePlexPlayer must be used within PlexAudioProvider')
  return ctx
}
