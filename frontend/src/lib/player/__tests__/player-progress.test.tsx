import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PlayerProvider, usePlayer } from '../use-player'
import { usePlayerProgress } from '../use-player-progress'
import { LocalAudioProvider } from '../local-audio-provider'
import { PlexAudioProvider } from '../plex-audio-provider'
import { JellyfinAudioProvider } from '../jellyfin-audio-provider'
import { playerProgressStore } from '../player-context'
import type { LocalTrackInfo, PlexTrackInfo } from '../types'

const mockLocalTrack1: LocalTrackInfo = {
  id: 'loc-1',
  url: 'blob:http://localhost/mock-uuid-1',
  title: 'Local Melody',
  artist: 'Local Artist',
  albumName: 'Local Album',
  albumArt: null,
  durationMs: 200000,
}

const mockLocalTrack2: LocalTrackInfo = {
  id: 'loc-2',
  url: 'blob:http://localhost/mock-uuid-2',
  title: 'Local Melody 2',
  artist: 'Local Artist',
  albumName: 'Local Album',
  albumArt: null,
  durationMs: 210000,
}

const mockPlexTrack1: PlexTrackInfo = {
  id: 'plex-1',
  ratingKey: '201',
  title: 'Plex Symphony',
  artist: 'Plex Artist',
  albumName: 'Plex Album',
  albumArt: null,
  durationMs: 300000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token',
}

const mockPlexTrack2: PlexTrackInfo = {
  id: 'plex-2',
  ratingKey: '202',
  title: 'Plex Symphony 2',
  artist: 'Plex Artist',
  albumName: 'Plex Album',
  albumArt: null,
  durationMs: 310000,
  plexBaseUrl: 'http://plex.server:32400',
  plexToken: 'token',
}

describe('Player Progress Decoupling & Queue Action Unification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        MediaContainer: {
          Metadata: [{ Media: [{ Part: [{ key: '/library/parts/part.mp3' }] }] }],
        },
      }),
    }))
  })

  it('updates usePlayerProgress on store progress updates without re-rendering usePlayer consumers', () => {
    let playerRenderCount = 0
    let progressRenderCount = 0

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

    const { result: progressResult } = renderHook(
      () => {
        progressRenderCount++
        return usePlayerProgress()
      },
    )

    const initialPlayerRenders = playerRenderCount
    const initialProgressRenders = progressRenderCount

    expect(progressResult.current.position).toBe(0)

    // Simulate high-frequency 4Hz timeupdate progress events
    act(() => {
      playerProgressStore.setProgress(1000, 200000)
    })
    act(() => {
      playerProgressStore.setProgress(2000, 200000)
    })
    act(() => {
      playerProgressStore.setProgress(3000, 200000)
    })

    // Progress hook updated to latest position
    expect(progressResult.current.position).toBe(3000)
    expect(progressResult.current.duration).toBe(200000)
    expect(progressRenderCount).toBeGreaterThan(initialProgressRenders)

    // usePlayer hook consumer did NOT re-render on time ticks!
    expect(playerRenderCount).toBe(initialPlayerRenders)
  })

  it('unifies queue actions for local source in PlayerProvider', async () => {
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

    await act(async () => {
      await result.current.playLocalTracks([mockLocalTrack1, mockLocalTrack2], 0)
    })

    expect(result.current.source).toBe('local')
    expect(result.current.localQueue.length).toBe(2)

    act(() => {
      result.current.setRepeatMode('all')
    })
    expect(result.current.repeatMode).toBe('all')

    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(true)

    act(() => {
      result.current.removeFromQueue(1)
    })
    expect(result.current.localQueue.length).toBe(1)
  })

  it('unifies queue actions for plex source in PlayerProvider', async () => {
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

    await act(async () => {
      await result.current.playPlexAlbum([mockPlexTrack1, mockPlexTrack2], 0)
    })

    expect(result.current.source).toBe('plex')
    expect(result.current.plexQueue.length).toBe(2)

    act(() => {
      result.current.setRepeatMode('one')
    })
    expect(result.current.repeatMode).toBe('one')

    act(() => {
      result.current.toggleShuffle()
    })
    expect(result.current.isShuffled).toBe(true)

    act(() => {
      result.current.removeFromQueue(1)
    })
    expect(result.current.plexQueue.length).toBe(1)
  })
})
