import { createContext } from 'react'
import type {
  LocalPlayerContextValue,
  PlexPlayerContextValue,
  JellyfinPlayerContextValue,
  PlayerContextValue,
  PlayerProgressContextValue,
} from './types'

export type ProgressListener = (progress: PlayerProgressContextValue) => void

export class PlayerProgressStore {
  private current: PlayerProgressContextValue = { position: 0, duration: 0 }
  private listeners = new Set<ProgressListener>()

  setProgress = (position: number, duration: number) => {
    const roundedPos = Math.round(position)
    const roundedDur = Math.round(duration)
    if (this.current.position === roundedPos && this.current.duration === roundedDur) return
    this.current = { position: roundedPos, duration: roundedDur }
    for (const listener of this.listeners) {
      listener(this.current)
    }
  }

  getProgress = (): PlayerProgressContextValue => {
    return this.current
  }

  subscribe = (listener: ProgressListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const playerProgressStore = new PlayerProgressStore()

export const LocalPlayerContext = createContext<LocalPlayerContextValue | null>(null)
export const PlexPlayerContext = createContext<PlexPlayerContextValue | null>(null)
export const JellyfinPlayerContext = createContext<JellyfinPlayerContextValue | null>(null)
export const PlayerContext = createContext<PlayerContextValue | null>(null)
export const PlayerProgressContext = createContext<PlayerProgressContextValue>({ position: 0, duration: 0 })

export const defaultPlayerContextValue: PlayerContextValue = {
  source: 'none',
  isPlaying: false,
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 0.7,
  error: null,
  repeatMode: 'off',
  isShuffled: false,
  toggleShuffle: () => {},
  setRepeatMode: () => {},
  removeFromQueue: () => {},
  moveQueueItem: () => {},
  togglePlay: async () => {},
  skipNext: async () => {},
  skipPrevious: async () => {},
  seek: async () => {},
  setVolume: () => {},
  stop: () => {},
  playPlexTrack: async () => {},
  playPlexAlbum: async () => {},
  skipPlexToIndex: () => {},
  playJellyfinTrack: async () => {},
  playJellyfinAlbum: async () => {},
  skipJellyfinToIndex: () => {},
  playLocalTrack: async () => {},
  playLocalTracks: async () => {},
  skipLocalToIndex: () => {},
  plexQueue: [],
  plexPreviousTracks: [],
  jellyfinQueue: [],
  jellyfinPreviousTracks: [],
  localQueue: [],
  localPreviousTracks: [],
}

export const defaultLocalPlayerContextValue: LocalPlayerContextValue = {
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

export const defaultPlexPlayerContextValue: PlexPlayerContextValue = {
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
  playAlbum: async () => {},
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

export const defaultJellyfinPlayerContextValue: JellyfinPlayerContextValue = {
  isPlaying: false,
  currentTrack: null,
  position: 0,
  duration: 0,
  volume: 0.7,
  queue: [],
  previousTracks: [],
  error: null,
  playTrack: async () => {},
  playAlbum: async () => {},
  togglePlay: () => {},
  pause: () => {},
  resume: () => {},
  seek: () => {},
  setVolume: () => {},
  skipNext: () => {},
  skipPrevious: () => {},
  skipToIndex: () => {},
  stop: () => {},
}
