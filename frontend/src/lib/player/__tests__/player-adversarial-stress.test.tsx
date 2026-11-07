import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PlayerProvider, usePlayer } from '../use-player'
import { usePlayerProgress } from '../use-player-progress'
import { LocalAudioProvider } from '../local-audio-provider'
import { useLocalPlayer } from '../hooks/use-local-player'
import { PlexAudioProvider } from '../plex-audio-provider'
import { usePlexPlayer } from '../hooks/use-plex-player'
import { JellyfinAudioProvider } from '../jellyfin-audio-provider'
import { playerProgressStore } from '../player-context'
import type { LocalTrackInfo, PlexTrackInfo } from '../types'

const createMockLocalTracks = (count: number): LocalTrackInfo[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `loc-track-${i + 1}`,
    url: `blob:http://localhost/mock-audio-${i + 1}`,
    title: `Local Track ${i + 1}`,
    artist: `Artist ${(i % 3) + 1}`,
    albumName: `Album ${(i % 2) + 1}`,
    albumArt: null,
    durationMs: 180000 + i * 10000,
    trackNumber: i + 1,
  }))

const createMockPlexTracks = (count: number): PlexTrackInfo[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `plex-track-${i + 1}`,
    ratingKey: `${100 + i + 1}`,
    title: `Plex Track ${i + 1}`,
    artist: `Plex Artist ${(i % 3) + 1}`,
    albumName: `Plex Album ${(i % 2) + 1}`,
    albumArt: `http://plex.server/art-${i + 1}`,
    durationMs: 200000 + i * 5000,
    plexBaseUrl: 'http://plex.server:32400',
    plexToken: 'mock-token-xyz',
  }))

describe('Adversarial Stress Harness: Player Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url)
      const match = urlStr.match(/\/library\/metadata\/(\d+)/)
      const ratingKey = match ? match[1] : '999'
      return {
        ok: true,
        status: 200,
        json: async () => ({
          MediaContainer: {
            Metadata: [{ Media: [{ Part: [{ key: `/library/parts/part-${ratingKey}.mp3` }] }] }],
          },
        }),
      }
    })
  })

  describe('1. High-Frequency Progress Store Subscriptions Under Stress', () => {
    it('handles 100 rapid setProgress ticks without triggering re-render callbacks in usePlayer', () => {
      let playerRenderCount = 0
      let progressRenderCount = 0

      // Consumer subscribing only to player context (transport & queue)
      renderHook(
        () => {
          playerRenderCount++
          const player = usePlayer()
          return { player }
        },
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

      // Consumer subscribing to decoupled high-frequency progress
      const { result: progressHook } = renderHook(() => {
        progressRenderCount++
        return usePlayerProgress()
      })

      const initialPlayerRenders = playerRenderCount
      const initialProgressRenders = progressRenderCount

      // Rapidly fire 100 progress ticks simulating intensive audio stream or rapid scrub
      act(() => {
        for (let i = 1; i <= 100; i++) {
          playerProgressStore.setProgress(i * 250, 180000)
        }
      })

      // Progress hook MUST receive the final tick values
      expect(progressHook.current.position).toBe(25000)
      expect(progressHook.current.duration).toBe(180000)
      expect(progressRenderCount).toBeGreaterThan(initialProgressRenders)

      // PlayerContext consumer MUST NOT have re-rendered even a single time from progress ticks
      expect(playerRenderCount).toBe(initialPlayerRenders)
    })

    it('supports 50 simultaneous progress subscribers without memory leak or desynchronization', () => {
      const listenerSnapshots: number[] = new Array(50).fill(0)
      const unsubs: (() => void)[] = []

      // Register 50 independent subscribers
      for (let i = 0; i < 50; i++) {
        const index = i
        const unsub = playerProgressStore.subscribe((p) => {
          listenerSnapshots[index] = p.position
        })
        unsubs.push(unsub)
      }

      // Fire bursts of updates
      act(() => {
        playerProgressStore.setProgress(1500, 120000)
        playerProgressStore.setProgress(3000, 120000)
        playerProgressStore.setProgress(4500, 120000)
      })

      // All 50 listeners must observe exactly 4500
      for (let i = 0; i < 50; i++) {
        expect(listenerSnapshots[i]).toBe(4500)
      }

      // Unsubscribe half of them
      for (let i = 0; i < 25; i++) {
        unsubs[i]()
      }

      // Fire another tick
      act(() => {
        playerProgressStore.setProgress(6000, 120000)
      })

      // Unsubscribed listeners remain at 4500, active listeners update to 6000
      for (let i = 0; i < 25; i++) {
        expect(listenerSnapshots[i]).toBe(4500)
      }
      for (let i = 25; i < 50; i++) {
        expect(listenerSnapshots[i]).toBe(6000)
      }

      // Clean up remaining
      for (let i = 25; i < 50; i++) {
        unsubs[i]()
      }
    })

    it('deduplicates identical rounded values and skips redundant listener notifications', () => {
      const mockListener = vi.fn()
      const unsub = playerProgressStore.subscribe(mockListener)

      act(() => {
        playerProgressStore.setProgress(100.2, 500.4) // rounds to 100, 500
      })
      expect(mockListener).toHaveBeenCalledTimes(1)

      // Send same rounded values repeatedly
      act(() => {
        playerProgressStore.setProgress(100.4, 500.1) // rounds to 100, 500
        playerProgressStore.setProgress(100.1, 500.3) // rounds to 100, 500
      })
      // Should not notify because rounded values did not change
      expect(mockListener).toHaveBeenCalledTimes(1)

      unsub()
    })
  })

  describe('2. Rapid Queue Reordering, Deletion, and Shuffle Integrity', () => {
    it('guarantees un-shuffle maintains integrity and NEVER resurrects deleted tracks in LocalAudio', async () => {
      const tracks = createMockLocalTracks(8)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })
      expect(result.current.queue.length).toBe(8)
      expect(result.current.currentTrack?.id).toBe('loc-track-1')

      // Turn shuffle ON
      act(() => {
        result.current.toggleShuffle()
      })
      expect(result.current.isShuffled).toBe(true)

      // Adversarial sequence while shuffled:
      // 1. Remove track at index 3
      const removedId1 = result.current.queue[3].id
      act(() => {
        result.current.removeFromQueue(3)
      })
      expect(result.current.queue.length).toBe(7)

      // 2. Remove tail item
      const removedId2 = result.current.queue[result.current.queue.length - 1].id
      act(() => {
        result.current.removeFromQueue(result.current.queue.length - 1)
      })
      expect(result.current.queue.length).toBe(6)

      // 3. Move items within shuffled queue
      act(() => {
        result.current.moveQueueItem(1, 4)
      })
      act(() => {
        result.current.moveQueueItem(3, 0)
      })
      expect(result.current.queue.length).toBe(6)

      // 4. Remove another item
      const removedId3 = result.current.queue[2].id
      act(() => {
        result.current.removeFromQueue(2)
      })
      expect(result.current.queue.length).toBe(5)

      // Turn shuffle OFF (un-shuffle)
      act(() => {
        result.current.toggleShuffle()
      })
      expect(result.current.isShuffled).toBe(false)
      expect(result.current.queue.length).toBe(5)

      // EMPIRICAL PROOF: None of the removed IDs must appear in the un-shuffled queue!
      const finalQueueIds = result.current.queue.map((t) => t.id)
      expect(finalQueueIds).not.toContain(removedId1)
      expect(finalQueueIds).not.toContain(removedId2)
      expect(finalQueueIds).not.toContain(removedId3)

      // Remaining tracks must preserve their original relative ordering
      const expectedIds = tracks
        .map((t) => t.id)
        .filter((id) => id !== removedId1 && id !== removedId2 && id !== removedId3)
      expect(finalQueueIds).toEqual(expectedIds)
    })

    it('guarantees un-shuffle maintains integrity and NEVER resurrects deleted tracks in PlexAudio', async () => {
      const tracks = createMockPlexTracks(8)
      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playAlbum(tracks, 0)
      })
      expect(result.current.queue.length).toBe(8)

      // Turn shuffle ON
      act(() => {
        result.current.toggleShuffle()
      })
      expect(result.current.isShuffled).toBe(true)

      // Adversarial sequence: remove multiple items while shuffled
      const removedId1 = result.current.queue[1].id
      act(() => {
        result.current.removeFromQueue(1)
      })

      const removedId2 = result.current.queue[4].id
      act(() => {
        result.current.removeFromQueue(4)
      })

      // Move items while shuffled
      act(() => {
        result.current.moveQueueItem(0, 3)
      })

      expect(result.current.queue.length).toBe(6)

      // Turn shuffle OFF
      act(() => {
        result.current.toggleShuffle()
      })
      expect(result.current.isShuffled).toBe(false)
      expect(result.current.queue.length).toBe(6)

      const finalIds = result.current.queue.map((t) => t.id)
      expect(finalIds).not.toContain(removedId1)
      expect(finalIds).not.toContain(removedId2)

      const expectedIds = tracks
        .map((t) => t.id)
        .filter((id) => id !== removedId1 && id !== removedId2)
      expect(finalIds).toEqual(expectedIds)
    })

    it('gracefully ignores out-of-bounds removals and invalid moves without throwing', async () => {
      const tracks = createMockLocalTracks(3)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })

      // Out of bounds removals
      act(() => {
        result.current.removeFromQueue(-1)
        result.current.removeFromQueue(99)
      })
      expect(result.current.queue.length).toBe(3)

      // Out of bounds moves
      act(() => {
        result.current.moveQueueItem(-1, 2)
        result.current.moveQueueItem(0, 100)
        result.current.moveQueueItem(50, 50)
      })
      expect(result.current.queue.length).toBe(3)
    })

    it('properly stops and cleans state when all items are removed while shuffled', async () => {
      const tracks = createMockLocalTracks(2)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })

      act(() => {
        result.current.toggleShuffle()
      })

      // Remove both items
      act(() => {
        result.current.removeFromQueue(0)
      })
      act(() => {
        result.current.removeFromQueue(0)
      })

      expect(result.current.queue).toEqual([])
      expect(result.current.currentTrack).toBe(null)
      expect(result.current.isPlaying).toBe(false)
    })
  })

  describe('3. Infinite Error Loop Suppression Under Repeat Modes', () => {
    it('halts LocalAudio cleanly after N attempts when all N tracks fail under repeatMode = all', async () => {
      let audioErrorHandler: (() => void) | null = null

      vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'error' && typeof handler === 'function') {
            audioErrorHandler = handler as () => void
          }
        },
      )

      const tracks = createMockLocalTracks(4)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })

      act(() => {
        result.current.setRepeatMode('all')
      })
      expect(result.current.repeatMode).toBe('all')

      // Track 1 fails -> advances to Track 2
      act(() => {
        audioErrorHandler?.()
      })
      expect(result.current.currentTrack?.id).toBe('loc-track-2')

      // Track 2 fails -> advances to Track 3
      act(() => {
        audioErrorHandler?.()
      })
      expect(result.current.currentTrack?.id).toBe('loc-track-3')

      // Track 3 fails -> advances to Track 4
      act(() => {
        audioErrorHandler?.()
      })
      expect(result.current.currentTrack?.id).toBe('loc-track-4')

      // Track 4 fails -> consecutive errors = 4 === queue.length
      // MUST cleanly halt playback rather than looping back to track 1!
      act(() => {
        audioErrorHandler?.()
      })

      expect(result.current.isPlaying).toBe(false)
    })

    it('halts PlexAudio cleanly after N attempts when all N tracks fail under repeatMode = all', async () => {
      let audioErrorHandler: (() => void) | null = null

      vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'error' && typeof handler === 'function') {
            audioErrorHandler = handler as () => void
          }
        },
      )

      const tracks = createMockPlexTracks(3)
      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playAlbum(tracks, 0)
      })

      act(() => {
        result.current.setRepeatMode('all')
      })

      // Simulate 3 consecutive track failures
      act(() => {
        audioErrorHandler?.()
      })
      act(() => {
        audioErrorHandler?.()
      })
      act(() => {
        audioErrorHandler?.()
      })

      // Must halt cleanly after 3 attempts
      expect(result.current.isPlaying).toBe(false)
    })

    it('halts immediately when a single-track queue fails under repeatMode = all', async () => {
      let audioErrorHandler: (() => void) | null = null

      vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'error' && typeof handler === 'function') {
            audioErrorHandler = handler as () => void
          }
        },
      )

      const tracks = createMockLocalTracks(1)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })

      act(() => {
        result.current.setRepeatMode('all')
      })

      // Single failure on single-track queue
      act(() => {
        audioErrorHandler?.()
      })

      expect(result.current.isPlaying).toBe(false)
    })

    it('resets consecutive error count when an intervening track succeeds', async () => {
      let audioErrorHandler: (() => void) | null = null
      let audioPlayHandler: (() => void) | null = null

      vi.spyOn(window.HTMLMediaElement.prototype, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'error' && typeof handler === 'function') {
            audioErrorHandler = handler as () => void
          }
          if (event === 'play' && typeof handler === 'function') {
            audioPlayHandler = handler as () => void
          }
        },
      )

      const tracks = createMockLocalTracks(3)
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      await act(async () => {
        await result.current.playTracks(tracks, 0)
      })

      act(() => {
        result.current.setRepeatMode('all')
      })

      // Track 1 fails
      act(() => {
        audioErrorHandler?.()
      })
      expect(result.current.currentTrack?.id).toBe('loc-track-2')

      // Track 2 succeeds! Play event fires and resets consecutive error counter
      act(() => {
        audioPlayHandler?.()
      })
      expect(result.current.isPlaying).toBe(true)

      // Later, Track 2 encounters an error
      act(() => {
        audioErrorHandler?.()
      })
      // Should advance to Track 3, NOT halt, because counter was reset!
      expect(result.current.currentTrack?.id).toBe('loc-track-3')
    })
  })

  describe('4. Polymorphic Transport & Cross-Source Switching', () => {
    it('seamlessly stops previous source when switching between Local and Plex tracks', async () => {
      const { result } = renderHook(() => usePlayer(), {
        wrapper: ({ children }) => (
          <LocalAudioProvider>
            <PlexAudioProvider>
              <JellyfinAudioProvider>
                <PlayerProvider>{children}</PlayerProvider>
              </JellyfinAudioProvider>
            </PlexAudioProvider>
          </LocalAudioProvider>
        ),
      })

      const localTrack = createMockLocalTracks(1)[0]
      const plexTrack = createMockPlexTracks(1)[0]

      // Start local playback
      await act(async () => {
        await result.current.playLocalTrack(localTrack)
      })
      expect(result.current.source).toBe('local')
      expect(result.current.currentTrack?.id).toBe('loc-track-1')

      // Switch to Plex playback
      await act(async () => {
        await result.current.playPlexTrack(plexTrack)
      })
      expect(result.current.source).toBe('plex')
      expect(result.current.currentTrack?.id).toBe(plexTrack.ratingKey)
      // Local queue must be stopped and cleared
      expect(result.current.localQueue).toEqual([])

      // Switch back to Local playback
      await act(async () => {
        await result.current.playLocalTrack(localTrack)
      })
      expect(result.current.source).toBe('local')
      expect(result.current.currentTrack?.id).toBe('loc-track-1')
      // Plex queue must be stopped and cleared
      expect(result.current.plexQueue).toEqual([])
    })

    it('strictly clamps volume inputs between 0.0 and 1.0', async () => {
      const { result } = renderHook(() => useLocalPlayer(), {
        wrapper: ({ children }) => <LocalAudioProvider>{children}</LocalAudioProvider>,
      })

      act(() => {
        result.current.setVolume(-0.5)
      })
      expect(result.current.volume).toBe(0)

      act(() => {
        result.current.setVolume(2.5)
      })
      expect(result.current.volume).toBe(1)

      act(() => {
        result.current.setVolume(0.42)
      })
      expect(result.current.volume).toBe(0.42)
    })
  })
})
