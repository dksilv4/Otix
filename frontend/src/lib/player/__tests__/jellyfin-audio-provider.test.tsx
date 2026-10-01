import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  JellyfinAudioProvider,
  useJellyfinPlayer,
  type JellyfinTrackInfo,
} from '../jellyfin-audio-provider'
import { PlexAudioProvider } from '../plex-audio-provider'
import { PlayerProvider, usePlayer } from '../use-player'

const mockTrack1: JellyfinTrackInfo = {
  id: 'jf-1',
  itemId: 'jf-1',
  title: 'Song One',
  artist: 'Artist A',
  albumName: 'Album Alpha',
  albumArt: 'http://localhost:8096/Images/art1.jpg',
  durationMs: 180000,
  serverUrl: 'http://localhost:8096',
  token: 'mock-token',
}

const mockTrack2: JellyfinTrackInfo = {
  id: 'jf-2',
  itemId: 'jf-2',
  title: 'Song Two',
  artist: 'Artist B',
  albumName: 'Album Beta',
  albumArt: 'http://localhost:8096/Images/art2.jpg',
  durationMs: 240000,
  serverUrl: 'http://localhost:8096',
  token: 'mock-token',
}

describe('JellyfinAudioProvider & usePlayer integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Mock HTMLMediaElement play/pause
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  it('throws when useJellyfinPlayer is called outside provider', () => {
    expect(() => {
      renderHook(() => useJellyfinPlayer())
    }).toThrow('useJellyfinPlayer must be used within JellyfinAudioProvider')
  })

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useJellyfinPlayer(), {
      wrapper: ({ children }) => <JellyfinAudioProvider>{children}</JellyfinAudioProvider>,
    })

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrack).toBe(null)
    expect(result.current.queue).toEqual([])
    expect(result.current.error).toBe(null)
  })

  it('plays a track and updates currentTrack and queue', async () => {
    const { result } = renderHook(() => useJellyfinPlayer(), {
      wrapper: ({ children }) => <JellyfinAudioProvider>{children}</JellyfinAudioProvider>,
    })

    await act(async () => {
      await result.current.playTrack(mockTrack1)
    })

    expect(result.current.currentTrack?.title).toBe('Song One')
    expect(result.current.queue.length).toBe(1)
    expect(result.current.isPlaying).toBe(true)
  })

  it('queues an album and starts at the specified index', async () => {
    const { result } = renderHook(() => useJellyfinPlayer(), {
      wrapper: ({ children }) => <JellyfinAudioProvider>{children}</JellyfinAudioProvider>,
    })

    await act(async () => {
      await result.current.playAlbum([mockTrack1, mockTrack2], 1)
    })

    expect(result.current.currentTrack?.title).toBe('Song Two')
    expect(result.current.queue.length).toBe(2)
    expect(result.current.previousTracks.length).toBe(1)
    expect(result.current.previousTracks[0].title).toBe('Song One')
  })

  it('unifies with usePlayer and reflects jellyfin source', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlexAudioProvider>
        <JellyfinAudioProvider>
          <PlayerProvider>{children}</PlayerProvider>
        </JellyfinAudioProvider>
      </PlexAudioProvider>
    )

    const { result } = renderHook(
      () => ({
        player: usePlayer(),
        jf: useJellyfinPlayer(),
      }),
      { wrapper },
    )

    expect(result.current.player.source).toBe('none')

    await act(async () => {
      await result.current.player.playJellyfinTrack(mockTrack1)
    })

    expect(result.current.player.source).toBe('jellyfin')
    expect(result.current.player.currentTrack?.title).toBe('Song One')
    expect(result.current.player.currentTrack?.source).toBe('jellyfin')
    expect(result.current.player.isPlaying).toBe(true)

    // Test toggle play
    act(() => {
      result.current.player.togglePlay()
    })

    // Test seek
    await act(async () => {
      await result.current.player.seek(15000)
    })
    expect(result.current.player.position).toBe(15000)
  })
})
