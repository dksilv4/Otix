import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { LocalAudioProvider } from '../local-audio-provider'
import { useLocalPlayer } from '../hooks/use-local-player'
import { PlexAudioProvider } from '../plex-audio-provider'
import { JellyfinAudioProvider } from '../jellyfin-audio-provider'
import { PlayerProvider, usePlayer } from '../use-player'
import type { LocalTrackInfo } from '../types'

const mockLocalTrack1: LocalTrackInfo = {
  id: 'loc-1',
  url: 'blob:http://localhost/mock-uuid-1',
  title: 'Local Melody',
  artist: 'Local Artist',
  albumName: 'Local Album',
  albumArt: 'blob:http://localhost/art-1',
  durationMs: 200000,
  trackNumber: 1,
}

const mockLocalTrack2: LocalTrackInfo = {
  id: 'loc-2',
  url: 'blob:http://localhost/mock-uuid-2',
  title: 'Second Track',
  artist: 'Local Artist',
  albumName: 'Local Album',
  albumArt: 'blob:http://localhost/art-1',
  durationMs: 180000,
  trackNumber: 2,
}

const mockLocalTrack3: LocalTrackInfo = {
  id: 'loc-3',
  url: 'blob:http://localhost/mock-uuid-3',
  title: 'Third Track',
  artist: 'Local Artist',
  albumName: 'Local Album',
  albumArt: 'blob:http://localhost/art-1',
  durationMs: 210000,
  trackNumber: 3,
}

describe('LocalAudioProvider & usePlayer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrack).toBe(null)
    expect(result.current.queue).toEqual([])
    expect(result.current.error).toBe(null)
    expect(result.current.repeatMode).toBe('off')
    expect(result.current.isShuffled).toBe(false)
  })

  it('plays a local track and tracks queue in useLocalPlayer', async () => {
    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(mockLocalTrack1)
    })

    expect(result.current.currentTrack).toEqual(mockLocalTrack1)
    expect(result.current.queue).toEqual([mockLocalTrack1])
  })

  it('integrates with usePlayer and reflects local source', async () => {
    const { result } = renderHook(
      () => ({
        local: useLocalPlayer(),
        player: usePlayer(),
      }),
      {
        wrapper: ({ children }) => (
          <LocalAudioProvider>
            <PlexAudioProvider>
              <JellyfinAudioProvider>
                <PlayerProvider>{children}</PlayerProvider>
              </JellyfinAudioProvider>
            </PlexAudioProvider>
          </LocalAudioProvider>
        ),
      },
    )

    expect(result.current.player.source).toBe('none')

    await act(async () => {
      await result.current.player.playLocalTrack(mockLocalTrack1)
    })

    expect(result.current.player.source).toBe('local')
    expect(result.current.player.currentTrack?.title).toBe('Local Melody')
    expect(result.current.player.currentTrack?.artist).toBe('Local Artist')
    expect(result.current.player.currentTrack?.source).toBe('local')
  })

  it('handles shuffle, repeat mode, and queue item removal without resurrecting items', async () => {
    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTracks([mockLocalTrack1, mockLocalTrack2, mockLocalTrack3], 0)
    })

    expect(result.current.queue.length).toBe(3)

    act(() => {
      result.current.setRepeatMode('all')
    })
    expect(result.current.repeatMode).toBe('all')

    // Toggle shuffle
    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(true)

    // Remove an item from queue while shuffled
    const itemToRemove = result.current.queue[1]
    act(() => {
      result.current.removeFromQueue(1)
    })
    expect(result.current.queue.length).toBe(2)

    // Toggle shuffle off: itemToRemove must NOT resurrect
    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(false)
    expect(result.current.queue.length).toBe(2)
    expect(result.current.queue.find((t) => t.id === itemToRemove.id)).toBeUndefined()
  })

  it('prevents last-track queue deadlock by resetting to track 0 with repeat off', async () => {
    let capturedAudioEnded: (() => void) | null = null

    vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === 'ended' && typeof handler === 'function') {
          capturedAudioEnded = handler as () => void
        }
      },
    )

    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTracks([mockLocalTrack1, mockLocalTrack2], 1)
    })

    expect(result.current.currentTrack?.id).toBe('loc-2')
    expect(result.current.repeatMode).toBe('off')

    // Simulate track end
    act(() => {
      capturedAudioEnded?.()
    })

    // Player transitions to stopped state at track 0 rather than deadlock / null
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrack?.id).toBe('loc-1')
  })

  it('halts playback when consecutive errors reach queue length under repeat-all', async () => {
    let capturedAudioError: (() => void) | null = null

    vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === 'error' && typeof handler === 'function') {
          capturedAudioError = handler as () => void
        }
      },
    )

    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTracks([mockLocalTrack1, mockLocalTrack2], 0)
    })

    act(() => {
      result.current.setRepeatMode('all')
    })

    // Simulate consecutive errors equal to queue length (2)
    act(() => {
      capturedAudioError?.()
    })
    act(() => {
      capturedAudioError?.()
    })

    // Playback must halt rather than entering infinite loop
    expect(result.current.isPlaying).toBe(false)
  })

  it('preserves paused state when active track is removed from queue', async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTracks([mockLocalTrack1, mockLocalTrack2], 0)
    })

    expect(result.current.currentTrack?.id).toBe(mockLocalTrack1.id)
    playSpy.mockClear()

    // Pause the player
    act(() => {
      result.current.pause()
    })
    expect(result.current.isPlaying).toBe(false)

    // Remove active track (index 0) while paused
    await act(async () => {
      result.current.removeFromQueue(0)
    })

    expect(result.current.currentTrack?.id).toBe(mockLocalTrack2.id)
    expect(result.current.isPlaying).toBe(false)
    expect(playSpy).not.toHaveBeenCalled()
    playSpy.mockRestore()
  })

  it('splices only single matching instance in originalQueueRef when queue contains duplicates', async () => {
    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    // Queue with duplicate track 1
    await act(async () => {
      await result.current.playTracks([mockLocalTrack1, mockLocalTrack1, mockLocalTrack2], 0)
    })

    expect(result.current.queue.length).toBe(3)

    // Remove first instance (index 0)
    act(() => {
      result.current.removeFromQueue(0)
    })
    expect(result.current.queue.length).toBe(2)

    // Toggle shuffle on and off
    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(true)

    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(false)

    // Second instance of mockLocalTrack1 must still exist
    expect(result.current.queue.length).toBe(2)
    expect(result.current.queue.filter((t) => t.id === mockLocalTrack1.id).length).toBe(1)
  })

  it('safely handles play rejection under repeat-one without unhandled error', async () => {
    let capturedAudioEnded: (() => void) | null = null

    vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === 'ended' && typeof handler === 'function') {
          capturedAudioEnded = handler as () => void
        }
      },
    )

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useLocalPlayer(), {
      wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(mockLocalTrack1)
    })

    act(() => {
      result.current.setRepeatMode('one')
    })

    // Next play (loop restart) rejects
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Autoplay blocked'))

    // Trigger ended event
    await act(async () => {
      capturedAudioEnded?.()
      await Promise.resolve()
    })

    expect(warnSpy).toHaveBeenCalledWith('[Audio] Loop play rejected:', expect.any(Error))
    warnSpy.mockRestore()
  })
})
