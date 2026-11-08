import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { UniversalPlayerProvider } from '../core/universal-player-context'
import { PlayerProvider } from '@/lib/player/player-provider'
import { usePlayer } from '@/lib/player/use-player'
import { universalPlayerEngine } from '../core/universal-player-engine'
import type { PlexTrackInfo, LocalTrackInfo } from '@/lib/player/types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: null }),
  },
}))

describe('Universal Player & Legacy Bridge Integration', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    universalPlayerEngine.stop()
  })

  it('allows legacy usePlayer() to play a Plex track through UniversalPlayerProvider', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const { result } = renderHook(() => usePlayer(), { wrapper })

    const track: PlexTrackInfo = {
      id: 'p-1',
      ratingKey: '101',
      title: 'Starlight',
      artist: 'Muse',
      albumName: 'Black Holes and Revelations',
      albumArt: 'https://example.com/art.jpg',
      durationMs: 240000,
      plexBaseUrl: 'http://192.168.1.100:32400',
      plexToken: 'secret',
      partKey: '/library/parts/101/file.flac',
    }

    await act(async () => {
      await result.current.playPlexTrack(track)
    })

    expect(result.current.source).toBe('plex')
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentTrack?.title).toBe('Starlight')
    expect(result.current.currentTrack?.artist).toBe('Muse')
    expect(universalPlayerEngine.getState().currentItem?.title).toBe('Starlight')
  })

  it('allows legacy usePlayer() to queue and play local tracks', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const { result } = renderHook(() => usePlayer(), { wrapper })

    const t1: LocalTrackInfo = {
      id: 'l-1',
      url: 'local-media://localhost?path=t1.mp3',
      title: 'Local Track 1',
      artist: 'Artist 1',
      albumName: 'Album 1',
      albumArt: null,
      durationMs: 180000,
    }

    const t2: LocalTrackInfo = {
      id: 'l-2',
      url: 'local-media://localhost?path=t2.mp3',
      title: 'Local Track 2',
      artist: 'Artist 2',
      albumName: 'Album 2',
      albumArt: null,
      durationMs: 200000,
    }

    await act(async () => {
      await result.current.playLocalTracks([t1, t2])
    })

    expect(result.current.source).toBe('local')
    expect(result.current.currentTrack?.title).toBe('Local Track 1')
    expect(result.current.localQueue.length).toBe(1)
    expect(result.current.localQueue[0].title).toBe('Local Track 2')

    await act(async () => {
      await result.current.skipNext()
    })

    expect(result.current.currentTrack?.title).toBe('Local Track 2')
    expect(result.current.localPreviousTracks.length).toBe(1)
    expect(result.current.localPreviousTracks[0].title).toBe('Local Track 1')
  })
})
