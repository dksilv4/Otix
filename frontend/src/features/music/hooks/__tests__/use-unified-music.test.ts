import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUnifiedMusic } from '../use-unified-music'

const mockPlayLocalTracks = vi.fn()
const mockPlayPlexAlbum = vi.fn()
const mockPlayLocalTrack = vi.fn()
const mockPlayPlexTrack = vi.fn()
const mockPlayAlbum = vi.fn()
const mockPlayArtist = vi.fn()
const mockPlayTracksInContext = vi.fn()

vi.mock('@/lib/player/use-player', () => ({
  usePlayer: () => ({
    currentTrack: null,
    isPlaying: false,
    localQueue: [],
    plexQueue: [],
    source: 'none',
    playLocalTrack: mockPlayLocalTrack,
    playLocalTracks: mockPlayLocalTracks,
    playPlexTrack: mockPlayPlexTrack,
    playPlexAlbum: mockPlayPlexAlbum,
  }),
}))

vi.mock('../../local/hooks/use-local-music', () => ({
  useLocalMusic: () => ({
    tracks: [
      {
        id: 'local-1',
        title: 'Local Song 1',
        artist: 'Local Artist',
        albumName: 'Local Album',
        durationMs: 180000,
        trackNumber: 1,
      },
      {
        id: 'local-2',
        title: 'Local Song 2',
        artist: 'Local Artist',
        albumName: 'Local Album',
        durationMs: 200000,
        trackNumber: 2,
      },
    ],
    albums: [
      {
        albumName: 'Local Album',
        artist: 'Local Artist',
        year: 2023,
        trackCount: 2,
        albumArtBlob: null,
      },
    ],
    artists: ['Local Artist'],
    folders: [{ id: 'f-1', name: 'MusicFolder', trackCount: 2 }],
    isLoading: false,
    isScanning: false,
    scanProgress: null,
    scanDirectory: vi.fn(),
    removeFolder: vi.fn(),
    clearAll: vi.fn(),
    playTrack: vi.fn(),
    playAll: vi.fn(),
    playAlbum: mockPlayAlbum,
    playArtist: mockPlayArtist,
    playTracksInContext: mockPlayTracksInContext,
    getPlayableTrack: (t: { id: string; title: string; artist: string; albumName: string; durationMs: number }) => ({
      ...t,
      albumArt: null,
      url: 'blob:test',
    }),
  }),
}))

vi.mock('../../plex/hooks/use-plex-music', () => ({
  usePlexMusic: () => ({
    browseType: 'tracks',
    setBrowseType: vi.fn(),
    items: [
      {
        ratingKey: 'plex-1',
        title: 'Plex Track A',
        artist: 'Plex Artist',
        thumbUrl: 'http://example.com/art.jpg',
        durationMs: 210000,
        type: 'track',
      },
      {
        ratingKey: 'plex-2',
        title: 'Plex Track B',
        artist: 'Plex Artist',
        thumbUrl: 'http://example.com/art.jpg',
        durationMs: 220000,
        type: 'track',
      },
    ],
    sections: [{ id: 1, title: 'Plex Music', serverName: 'Server1' }],
    activeSectionId: 1,
    activeServerId: 10,
    setSelectedSectionId: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    isDiscovering: false,
    discoverSections: vi.fn(),
    playPlexItem: vi.fn(),
    playPlexItems: vi.fn(),
    playPlexAlbumByRatingKey: vi.fn(),
    playPlexArtistByRatingKey: vi.fn(),
  }),
}))

describe('useUnifiedMusic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates local and plex tracks seamlessly without separate tabs', () => {
    const { result } = renderHook(() => useUnifiedMusic())

    expect(result.current.tracks.length).toBe(4)
    expect(result.current.tracks.some((t) => t.source === 'local')).toBe(true)
    expect(result.current.tracks.some((t) => t.source === 'plex')).toBe(true)
  })

  it('filters tracks by source filter', () => {
    const { result } = renderHook(() => useUnifiedMusic())

    act(() => {
      result.current.setSourceFilter('local')
    })
    expect(result.current.tracks.every((t) => t.source === 'local')).toBe(true)
    expect(result.current.tracks.length).toBe(2)

    act(() => {
      result.current.setSourceFilter('plex')
    })
    expect(result.current.tracks.every((t) => t.source === 'plex')).toBe(true)
    expect(result.current.tracks.length).toBe(2)
  })

  it('filters tracks by search query across sources with debounce', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useUnifiedMusic())

    act(() => {
      result.current.setSearchQuery('Song 1')
    })
    // Before debounce timeout completes, tracks remain responsive
    expect(result.current.tracks.length).toBe(4)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    // After debounce timeout, filtered results are presented
    expect(result.current.tracks.length).toBe(1)
    expect(result.current.tracks[0].title).toBe('Local Song 1')

    vi.useRealTimers()
  })

  it('playTrackInContext automatically queues context tracks and plays clicked song', async () => {
    const { result } = renderHook(() => useUnifiedMusic())

    const localTrack = result.current.tracks.find((t) => t.id === 'local-2')!
    await act(async () => {
      await result.current.playTrackInContext(localTrack, result.current.tracks)
    })

    expect(mockPlayTracksInContext).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'local-1' }),
        expect.objectContaining({ id: 'local-2' }),
      ]),
      1,
    )
  })
})
