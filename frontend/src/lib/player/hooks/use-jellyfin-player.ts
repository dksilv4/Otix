import { useContext } from 'react'
import { JellyfinPlayerContext } from '../jellyfin-audio-provider'
import type { JellyfinPlayerContextValue } from '../types'

export const useJellyfinPlayer = (): JellyfinPlayerContextValue => {
  const ctx = useContext(JellyfinPlayerContext)
  if (!ctx) throw new Error('useJellyfinPlayer must be used within JellyfinAudioProvider')
  return ctx
}
