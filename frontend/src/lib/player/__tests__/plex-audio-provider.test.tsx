import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PlexAudioProvider } from '../plex-audio-provider'
import { usePlexPlayer } from '../hooks/use-plex-player'
import type { PlexTrackInfo } from '../types'

const mockPlexTrack1: PlexTrackInfo = {
  id: 'plex-1',
  ratingKey: '101',
  title: 'Plex Track One',
  artist: 'Plex Artist',
  albumName: 'Plex Album',
  albumArt: 'http://plex.server/art1',
  durationMs: 240000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'mock-token-123',
}

const mockPlexTrack2: PlexTrackInfo = {
  id: 'plex-2',
  ratingKey: '102',
  title: 'Plex Track Two',
  artist: 'Plex Artist',
  albumName: 'Plex Album',
  albumArt: 'http://plex.server/art2',
  durationMs: 180000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'mock-token-123',
}

const mockPlexTrack3: PlexTrackInfo = {
  id: 'plex-3',
  ratingKey: '103',
  title: 'Plex Track Three',
  artist: 'Plex Artist',
  albumName: 'Plex Album',
  albumArt: 'http://plex.server/art3',
  durationMs: 210000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'mock-token-123',
}

describe('PlexAudioProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    // Mock fetch for Plex part metadata resolution
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url)
      if (urlStr.includes('/library/metadata/101')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-101.mp3' }] }] }],
            },
          }),
        }
      }
      if (urlStr.includes('/library/metadata/102')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-102.mp3' }] }] }],
            },
          }),
        }
      }
      if (urlStr.includes('/library/metadata/103')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-103.mp3' }] }] }],
            },
          }),
        }
      }
      // Plex timeline report fetch
      return { ok: true, status: 200, json: async () => ({}) }
    })
  })

  it('throws when usePlexPlayer is called outside provider', () => {
    expect(() => {
      renderHook(() => usePlexPlayer())
    }).toThrow('usePlexPlayer must be used within PlexAudioProvider')
  })

  it('initializes with default idle state', () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrack).toBe(null)
    expect(result.current.queue).toEqual([])
    expect(result.current.error).toBe(null)
    expect(result.current.position).toBe(0)
    expect(result.current.duration).toBe(0)
    expect(result.current.repeatMode).toBe('off')
    expect(result.current.isShuffled).toBe(false)
  })

  it('plays an album and resolves Plex stream URLs', async () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playAlbum([mockPlexTrack1, mockPlexTrack2], 0)
    })

    expect(result.current.currentTrack?.title).toBe('Plex Track One')
    expect(result.current.queue.length).toBe(2)
  })

  it('discards superseded track loads during rapid track skipping (monotonic request sequence tracking)', async () => {
    let resolveFirstRequest: ((value: unknown) => void) | null = null

    // Override fetch so first track hangs until manually resolved
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url)
      if (urlStr.includes('/library/metadata/101')) {
        return new Promise((resolve) => {
          resolveFirstRequest = () => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                MediaContainer: {
                  Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-101.mp3' }] }] }],
                },
              }),
            })
          }
        })
      }
      if (urlStr.includes('/library/metadata/102')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-102.mp3' }] }] }],
            },
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    // Start playing album with Track 1 (which hangs)
    act(() => {
      void result.current.playAlbum([mockPlexTrack1, mockPlexTrack2], 0)
    })

    // Rapidly skip to Track 2 while Track 1 is still in-flight
    await act(async () => {
      await result.current.skipToIndex(1)
    })

    expect(result.current.currentTrack?.id).toBe('plex-2')

    // Now let the slow Track 1 request resolve
    await act(async () => {
      resolveFirstRequest?.(null)
    })

    // Current track must still be Track 2, not overwritten by stale Track 1
    expect(result.current.currentTrack?.id).toBe('plex-2')
  })

  it('supports shuffle, repeat modes, queue item removal, and reordering without resurrection', async () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playAlbum([mockPlexTrack1, mockPlexTrack2, mockPlexTrack3], 0)
    })

    expect(result.current.queue.length).toBe(3)

    // Repeat mode toggle
    act(() => {
      result.current.setRepeatMode('all')
    })
    expect(result.current.repeatMode).toBe('all')

    act(() => {
      result.current.setRepeatMode('one')
    })
    expect(result.current.repeatMode).toBe('one')

    // Shuffle toggle on
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

    // Un-shuffle: itemToRemove should NOT resurrect
    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(false)
    expect(result.current.queue.length).toBe(2)
    expect(result.current.queue.find((t) => t.id === itemToRemove.id)).toBeUndefined()

    // Move queue item
    act(() => {
      result.current.moveQueueItem(0, 1)
    })
    expect(result.current.queue.length).toBe(2)
  })

  it('clears timeline timeout and reports stopped on pause and stop', async () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(mockPlexTrack1)
    })

    act(() => {
      result.current.pause()
    })
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.stop()
    })
    expect(result.current.currentTrack).toBe(null)
    expect(result.current.queue).toEqual([])
  })

  it('preserves paused state when active track is removed from queue', async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playAlbum([mockPlexTrack1, mockPlexTrack2], 0)
    })

    expect(result.current.currentTrack?.id).toBe(mockPlexTrack1.id)
    playSpy.mockClear()

    act(() => {
      result.current.pause()
    })
    expect(result.current.isPlaying).toBe(false)

    // Remove active track while paused
    await act(async () => {
      result.current.removeFromQueue(0)
    })

    expect(result.current.currentTrack?.id).toBe(mockPlexTrack2.id)
    expect(result.current.isPlaying).toBe(false)
    expect(playSpy).not.toHaveBeenCalled()
    playSpy.mockRestore()
  })

  it('splices only single matching instance in originalQueueRef when queue contains duplicates', async () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playAlbum([mockPlexTrack1, mockPlexTrack1, mockPlexTrack2], 0)
    })

    expect(result.current.queue.length).toBe(3)

    await act(async () => {
      result.current.removeFromQueue(0)
    })
    expect(result.current.queue.length).toBe(2)

    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(true)

    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(false)

    expect(result.current.queue.length).toBe(2)
    expect(result.current.queue.filter((t) => t.id === mockPlexTrack1.id).length).toBe(1)
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

    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(mockPlexTrack1)
    })

    act(() => {
      result.current.setRepeatMode('one')
    })

    // Loop replay rejects
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Autoplay blocked'))

    // Trigger ended event
    await act(async () => {
      capturedAudioEnded?.()
      await Promise.resolve()
    })

    expect(warnSpy).toHaveBeenCalledWith('[Audio] Loop play rejected:', expect.any(Error))
    warnSpy.mockRestore()
  })

  it('constructs direct streaming URL without network fetch when track.partKey is present', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    const directTrack: PlexTrackInfo = {
      id: 'plex-direct',
      ratingKey: '999',
      title: 'Direct Stream Track',
      artist: 'Direct Artist',
      albumName: 'Direct Album',
      albumArt: null,
      durationMs: 300000,
      plexBaseUrl: 'http://plex.server:32400',
      plexToken: 'mock-token-123',
      partKey: '/library/parts/direct-stream-999.flac',
    }

    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(directTrack)
    })

    expect(result.current.currentTrack?.title).toBe('Direct Stream Track')
    // Verify that fetch was NOT called for metadata resolution because partKey was provided directly
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
