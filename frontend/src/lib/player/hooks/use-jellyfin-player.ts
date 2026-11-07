import { useContext } from 'react'
import { JellyfinPlayerContext } from '../player-context'
import type { JellyfinPlayerContextValue, JellyfinTrackInfo } from '../types'

export type { JellyfinTrackInfo }

export const useJellyfinPlayer = (): JellyfinPlayerContextValue => {
  const ctx = useContext(JellyfinPlayerContext)
  if (!ctx) throw new Error('useJellyfinPlayer must be used within JellyfinAudioProvider')
  return ctx
}
