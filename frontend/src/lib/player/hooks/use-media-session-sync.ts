import { useEffect } from 'react'
import type { PlayerTrackInfo } from '../types'

interface MediaSessionSyncProps {
  currentTrack: PlayerTrackInfo | null
  isPlaying: boolean
  togglePlay: () => void
  skipNext: () => void
  skipPrevious: () => void
  seek: (ms: number) => void
}

export const useMediaSessionSync = ({
  currentTrack,
  isPlaying,
  togglePlay,
  skipNext,
  skipPrevious,
  seek,
}: MediaSessionSyncProps): void => {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      return
    }

    try {
      const artwork = currentTrack.albumArt
        ? [{ src: currentTrack.albumArt, sizes: '512x512', type: 'image/jpeg' }]
        : []

      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist || 'Unknown Artist',
          album: currentTrack.albumName || '',
          artwork,
        })
      } else {
        // Fallback for environments where MediaMetadata class is not polyfilled
        navigator.mediaSession.metadata = {
          title: currentTrack.title,
          artist: currentTrack.artist || 'Unknown Artist',
          album: currentTrack.albumName || '',
          artwork,
        } as unknown as MediaMetadata
      }
    } catch (e) {
      console.warn('[MediaSession] Failed to set metadata:', e)
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [currentTrack, isPlaying])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession

    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Unsupported action on some browser engines
      }
    }

    setAction('play', () => {
      togglePlay()
    })
    setAction('pause', () => {
      togglePlay()
    })
    setAction('nexttrack', () => {
      skipNext()
    })
    setAction('previoustrack', () => {
      skipPrevious()
    })
    setAction('seekto', (details) => {
      if (details.seekTime != null) {
        seek(details.seekTime * 1000)
      }
    })

    return () => {
      setAction('play', null)
      setAction('pause', null)
      setAction('nexttrack', null)
      setAction('previoustrack', null)
      setAction('seekto', null)
    }
  }, [togglePlay, skipNext, skipPrevious, seek])
}
