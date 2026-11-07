import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PlexAudioProvider } from '../plex-audio-provider'
import { usePlexPlayer } from '../hooks/use-plex-player'
import type { PlexTrackInfo } from '../types'

const trackA: PlexTrackInfo = {
  id: 'plex-A',
  ratingKey: '101',
  title: 'Track A',
  artist: 'Artist Alpha',
  albumName: 'Album Alpha',
  albumArt: 'http://plex.server/artA',
  durationMs: 200000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token-abc',
}

const trackB: PlexTrackInfo = {
  id: 'plex-B',
  ratingKey: '102',
  title: 'Track B',
  artist: 'Artist Beta',
  albumName: 'Album Beta',
  albumArt: 'http://plex.server/artB',
  durationMs: 220000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token-abc',
}

const trackC: PlexTrackInfo = {
  id: 'plex-C',
  ratingKey: '103',
  title: 'Track C',
  artist: 'Artist Gamma',
  albumName: 'Album Gamma',
  albumArt: 'http://plex.server/artC',
  durationMs: 240000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token-abc',
}

const trackD: PlexTrackInfo = {
  id: 'plex-D',
  ratingKey: '104',
  title: 'Track D',
  artist: 'Artist Delta',
  albumName: 'Album Delta',
  albumArt: 'http://plex.server/artD',
  durationMs: 260000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token-abc',
}

describe('PlexAudioProvider Adversarial & Stress Testing', () => {
  let srcAssignments: string[] = []
  let originalSrcDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    srcAssignments = []

    // Intercept audio.src assignments
    originalSrcDescriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      'src',
    )
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get() {
        return srcAssignments[srcAssignments.length - 1] || ''
      },
      set(val: string) {
        srcAssignments.push(val)
      },
    })

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'))
    })
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'))
    })
  })

  afterEach(() => {
    if (originalSrcDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', originalSrcDescriptor)
    }
    vi.useRealTimers()
  })

  describe('1. Asynchronous request race conditions during rapid track skipping', () => {
    it('discards out-of-order network responses and prevents older responses from clobbering audio.src or active track', async () => {
      // Deferred promises for each track's metadata request
      const deferreds: Record<string, { resolve: (val: unknown) => void; reject: (err: unknown) => void }> = {}

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        for (const [key, id] of [['101', 'A'], ['102', 'B'], ['103', 'C'], ['104', 'D']]) {
          if (urlStr.includes(`/library/metadata/${key}`)) {
            return new Promise((resolve, reject) => {
              deferreds[id] = {
                resolve: (val) => resolve(val),
                reject: (err) => reject(err),
              }
            })
          }
        }
        // Timeline reporting
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      // User starts album with Track A (request A in flight)
      act(() => {
        void result.current.playAlbum([trackA, trackB, trackC, trackD], 0)
      })
      expect(result.current.currentTrack?.id).toBe('plex-A')

      // Rapidly skip to Track B (request B in flight)
      act(() => {
        result.current.skipToIndex(1)
      })
      expect(result.current.currentTrack?.id).toBe('plex-B')

      // Rapidly skip to Track C (request C in flight)
      act(() => {
        result.current.skipToIndex(2)
      })
      expect(result.current.currentTrack?.id).toBe('plex-C')

      // Rapidly skip to Track D (request D in flight)
      act(() => {
        result.current.skipToIndex(3)
      })
      expect(result.current.currentTrack?.id).toBe('plex-D')

      // At this point, requests A, B, C, D are all in-flight.
      // audio.src has not been assigned any valid part URL yet.
      expect(srcAssignments).toEqual([])

      // SIMULATE OUT-OF-ORDER RESPONSES:
      // 1. Response D resolves FIRST:
      await act(async () => {
        deferreds['D'].resolve({
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-D.mp3' }] }] }],
            },
          }),
        })
      })

      // Audio src MUST now be assigned to Track D's part URL
      expect(srcAssignments.length).toBe(1)
      expect(srcAssignments[0]).toContain('/library/parts/part-D.mp3')
      expect(result.current.currentTrack?.id).toBe('plex-D')

      // 2. Response A resolves SECOND (superseded and stale):
      await act(async () => {
        deferreds['A'].resolve({
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-A.mp3' }] }] }],
            },
          }),
        })
      })

      // Audio src MUST NOT be clobbered by stale Track A!
      expect(srcAssignments.length).toBe(1)
      expect(srcAssignments[0]).toContain('/library/parts/part-D.mp3')
      expect(result.current.currentTrack?.id).toBe('plex-D')

      // 3. Response C resolves THIRD (superseded and stale):
      await act(async () => {
        deferreds['C'].resolve({
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-C.mp3' }] }] }],
            },
          }),
        })
      })

      // Audio src MUST NOT be clobbered by stale Track C!
      expect(srcAssignments.length).toBe(1)
      expect(srcAssignments[0]).toContain('/library/parts/part-D.mp3')
      expect(result.current.currentTrack?.id).toBe('plex-D')

      // 4. Response B resolves FOURTH (superseded and stale):
      await act(async () => {
        deferreds['B'].resolve({
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-B.mp3' }] }] }],
            },
          }),
        })
      })

      // Audio src MUST STILL be Track D!
      expect(srcAssignments.length).toBe(1)
      expect(srcAssignments[0]).toContain('/library/parts/part-D.mp3')
      expect(result.current.currentTrack?.id).toBe('plex-D')
      expect(result.current.error).toBe(null)
    })

    it('discards network errors from superseded requests without mutating error state', async () => {
      const deferreds: Record<string, { resolve: (val: unknown) => void; reject: (err: unknown) => void }> = {}

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/library/metadata/101')) {
          return new Promise((resolve, reject) => {
            deferreds['A'] = { resolve: (val) => resolve(val), reject: (err) => reject(err) }
          })
        }
        if (urlStr.includes('/library/metadata/102')) {
          return new Promise((resolve, reject) => {
            deferreds['B'] = { resolve: (val) => resolve(val), reject: (err) => reject(err) }
          })
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      // Track A begins loading
      act(() => {
        void result.current.playAlbum([trackA, trackB], 0)
      })

      // Quickly skip to Track B
      act(() => {
        result.current.skipToIndex(1)
      })

      // Track B resolves successfully
      await act(async () => {
        deferreds['B'].resolve({
          ok: true,
          status: 200,
          json: async () => ({
            MediaContainer: {
              Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part-B.mp3' }] }] }],
            },
          }),
        })
      })

      expect(srcAssignments.length).toBe(1)
      expect(srcAssignments[0]).toContain('/library/parts/part-B.mp3')
      expect(result.current.error).toBe(null)

      // Stale Track A fails with network exception
      await act(async () => {
        deferreds['A'].reject(new Error('Network offline or socket timeout'))
      })

      // Error must NOT be set on player because Track A was superseded
      expect(result.current.error).toBe(null)
      expect(result.current.currentTrack?.id).toBe('plex-B')
      expect(srcAssignments.length).toBe(1)
    })
  })

  describe('2. Timeline reporting timer cleanup', () => {
    it('aborts timeline "playing" report when playback is paused within 500ms', async () => {
      vi.useFakeTimers()

      const reportedStates: string[] = []
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/library/metadata/')) {
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
        if (urlStr.includes('/:/timeline')) {
          const params = new URL(urlStr).searchParams
          const state = params.get('state')
          if (state) reportedStates.push(state)
          return { ok: true, status: 200, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      // Start playing track
      await act(async () => {
        await result.current.playTrack(trackA)
      })

      // Audio starts playing: immediately reports 'buffering'
      expect(reportedStates).toContain('buffering')
      expect(reportedStates).not.toContain('playing')

      // Pause playback at t = 200ms (before the 500ms debounce expires)
      act(() => {
        vi.advanceTimersByTime(200)
        result.current.pause()
      })

      // Pausing sends 'paused' report and clears timers
      expect(reportedStates).toContain('paused')

      // Advance timers by 400ms (reaching t = 600ms total, beyond the initial 500ms threshold)
      act(() => {
        vi.advanceTimersByTime(400)
      })

      // 'playing' must NOT have been reported because pause cancelled the 500ms timeout!
      expect(reportedStates.filter((s) => s === 'playing')).toHaveLength(0)

      // Advance timers by 10,000ms to verify periodic interval is also dead
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(reportedStates.filter((s) => s === 'playing')).toHaveLength(0)
    })

    it('aborts timeline "playing" report when playback is stopped within 500ms', async () => {
      vi.useFakeTimers()

      const reportedStates: string[] = []
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/library/metadata/')) {
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
        if (urlStr.includes('/:/timeline')) {
          const params = new URL(urlStr).searchParams
          const state = params.get('state')
          if (state) reportedStates.push(state)
          return { ok: true, status: 200, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      // Start playing track
      await act(async () => {
        await result.current.playTrack(trackA)
      })

      expect(reportedStates).toContain('buffering')
      expect(reportedStates).not.toContain('playing')

      // Stop playback at t = 150ms
      act(() => {
        vi.advanceTimersByTime(150)
        result.current.stop()
      })

      expect(reportedStates).toContain('stopped')

      // Advance timers past 500ms and interval
      act(() => {
        vi.advanceTimersByTime(6000)
      })

      // 'playing' must NEVER have been reported
      expect(reportedStates.filter((s) => s === 'playing')).toHaveLength(0)
    })

    it('aborts timeline "playing" report when playback is paused at boundary t = 490ms', async () => {
      vi.useFakeTimers()

      const reportedStates: string[] = []
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/library/metadata/')) {
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
        if (urlStr.includes('/:/timeline')) {
          const params = new URL(urlStr).searchParams
          const state = params.get('state')
          if (state) reportedStates.push(state)
          return { ok: true, status: 200, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playTrack(trackA)
      })

      // Advance to 490ms — 10ms before timeout would fire
      act(() => {
        vi.advanceTimersByTime(490)
        result.current.pause()
      })

      expect(reportedStates).toContain('paused')

      // Advance another 100ms
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(reportedStates.filter((s) => s === 'playing')).toHaveLength(0)
    })

    it('cancels previous track timeline timers and reports when skipping to next track within 500ms', async () => {
      vi.useFakeTimers()

      const timelineReports: { ratingKey: string; state: string }[] = []
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/library/metadata/')) {
          const ratingKey = urlStr.match(/\/metadata\/(\d+)/)?.[1] || '101'
          return {
            ok: true,
            status: 200,
            json: async () => ({
              MediaContainer: {
                Metadata: [{ Media: [{ Part: [{ key: `/library/parts/part-${ratingKey}.mp3` }] }] }],
              },
            }),
          }
        }
        if (urlStr.includes('/:/timeline')) {
          const params = new URL(urlStr).searchParams
          const state = params.get('state') || ''
          const ratingKey = params.get('ratingKey') || ''
          timelineReports.push({ ratingKey, state })
          return { ok: true, status: 200, json: async () => ({}) }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playAlbum([trackA, trackB], 0)
      })

      // Track A started
      expect(timelineReports.some((r) => r.ratingKey === '101' && r.state === 'buffering')).toBe(true)

      // At 250ms, user skips to Track B
      act(() => {
        vi.advanceTimersByTime(250)
      })
      await act(async () => {
        await result.current.skipNext()
      })

      // Track A's 500ms timer should be dead; Track A must NEVER report "playing"
      act(() => {
        vi.advanceTimersByTime(600)
      })

      // Track A should NOT have reported 'playing'
      expect(timelineReports.some((r) => r.ratingKey === '101' && r.state === 'playing')).toBe(false)
      // Track B should have reported 'playing'
      expect(timelineReports.some((r) => r.ratingKey === '102' && r.state === 'playing')).toBe(true)
    })
  })
})

