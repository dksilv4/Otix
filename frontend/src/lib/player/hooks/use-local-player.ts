import { useContext } from 'react'
import { LocalPlayerContext } from '../player-context'
import type { LocalPlayerContextValue } from '../types'

const defaultContext: LocalPlayerContextValue = {
  isPlaying: false,
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 0.7,
  queue: [],
  previousTracks: [],
  repeatMode: 'off',
  isShuffled: false,
  error: null,
  playTrack: async () => {},
  playTracks: async () => {},
  togglePlay: () => {},
  pause: () => {},
  resume: () => {},
  seek: () => {},
  setVolume: () => {},
  skipNext: () => {},
  skipPrevious: () => {},
  skipToIndex: () => {},
  removeFromQueue: () => {},
  moveQueueItem: () => {},
  toggleShuffle: () => {},
  setRepeatMode: () => {},
  stop: () => {},
}

export const useLocalPlayer = (): LocalPlayerContextValue => {
  const ctx = useContext(LocalPlayerContext)
  return ctx ?? defaultContext
}
