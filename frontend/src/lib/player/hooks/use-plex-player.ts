import { useContext } from 'react'
import { PlexPlayerContext } from '../player-context'
import type { PlexPlayerContextValue, PlexTrackInfo } from '../types'

export type { PlexTrackInfo }

export const usePlexPlayer = (): PlexPlayerContextValue => {
  const ctx = useContext(PlexPlayerContext)
  if (!ctx) throw new Error('usePlexPlayer must be used within PlexAudioProvider')
  return ctx
}
