import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { UniversalPlayerProvider } from '@/features/player/core/universal-player-context'
import { PlayerProvider } from '@/lib/player/player-provider'
import { usePlayer } from '@/lib/player/use-player'
import { universalPlayerEngine } from '@/features/player/core/universal-player-engine'
import { handleDroppedMusic } from '@/features/drop/utils/drop-music-handler'
import { useUnifiedMusic } from '@/features/music/hooks/use-unified-music'
import { clearSessionFiles } from '@/features/music/local/utils/session-file-map'
import type { StoredLocalTrack } from '@/features/music/local/utils/local-music-db'

let inMemoryDbTracks: StoredLocalTrack[] = []
let inMemoryDbFolders: any[] = []
const inMemoryDbBlobs = new Map<string, Blob>()

vi.mock('@/features/music/local/utils/local-music-db', () => ({
  openLocalMusicDb: vi.fn(),
  saveTracksToDb: vi.fn().mockImplementation(async (tracks: StoredLocalTrack[]) => {
    inMemoryDbTracks = [...inMemoryDbTracks, ...tracks]
  }),
  saveFolderToDb: vi.fn().mockImplementation(async (folder: any) => {
    inMemoryDbFolders = [...inMemoryDbFolders, folder]
  }),
  getAllTracksFromDb: vi.fn().mockImplementation(async () => inMemoryDbTracks),
  getAllFoldersFromDb: vi.fn().mockImplementation(async () => inMemoryDbFolders),
  deleteFolderFromDb: vi.fn(),
  deleteTracksByFolderFromDb: vi.fn(),
  clearAllTracksFromDb: vi.fn().mockImplementation(async () => {
    inMemoryDbTracks = []
    inMemoryDbFolders = []
    inMemoryDbBlobs.clear()
  }),
  saveAudioBlobToDb: vi.fn().mockImplementation(async (id: string, blob: Blob) => {
    inMemoryDbBlobs.set(id, blob)
  }),
  getAudioBlobFromDb: vi.fn().mockImplementation(async (id: string) => {
    return inMemoryDbBlobs.get(id) ?? null
  }),
  deleteAudioBlobFromDb: vi.fn().mockImplementation(async (id: string) => {
    inMemoryDbBlobs.delete(id)
  }),
  clearAllAudioBlobsFromDb: vi.fn().mockImplementation(async () => {
    inMemoryDbBlobs.clear()
  }),
  getCachedAlbumArtBlob: vi.fn().mockReturnValue(null),
  setCachedAlbumArtBlob: vi.fn(),
}))

vi.mock('@/features/music/plex/hooks/use-plex-music', () => ({
  usePlexMusic: () => ({
    browseType: 'tracks',
    setBrowseType: vi.fn(),
    setSearchQuery: vi.fn(),
    items: [],
    sections: [],
    activeSectionId: null,
    activeServerId: null,
    setSelectedSectionId: vi.fn(),
    discoverSections: vi.fn(),
    isDiscovering: false,
    isLoading: false,
    playPlexItems: vi.fn(),
    playPlexAlbumByRatingKey: vi.fn(),
    playPlexArtistByRatingKey: vi.fn(),
  }),
}))

describe('Reproducing imported / dragged in song playback', () => {
  let playSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionFiles()
    inMemoryDbTracks = []
    inMemoryDbFolders = []
    inMemoryDbBlobs.clear()
    universalPlayerEngine.stop()

    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (this: any) {
      console.log('[HTMLMediaElement.play] called with src:', this.src)
      return Promise.resolve()
    })
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: any) {
      console.log('[HTMLMediaElement.pause] called')
    })
  })

  it('plays via useUnifiedMusic playTrackInContext', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const playerHook = renderHook(() => usePlayer(), { wrapper })

    const fakeFile = new File(['audio-data'], 'test-song.mp3', { type: 'audio/mp3' })
    Object.defineProperty(fakeFile, 'size', { value: 50000 })
    Object.defineProperty(fakeFile, 'lastModified', { value: 123456789 })

    const droppedItems = [{
      file: fakeFile,
      path: 'test-song.mp3',
    }]

    const dropResult = await handleDroppedMusic(droppedItems, playerHook.result.current.playLocalTracks, {
      autoPlay: false,
    })
    expect(dropResult.success).toBe(true)

    const unifiedHook = renderHook(() => useUnifiedMusic(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    console.log('unified tracks:', unifiedHook.result.current.tracks.length)
    const track = unifiedHook.result.current.tracks[0]
    console.log('unified track:', track)

    await act(async () => {
      await unifiedHook.result.current.playTrackInContext(track, unifiedHook.result.current.tracks)
    })

    console.log('Player status after playTrackInContext:', universalPlayerEngine.getState().status)
    console.log('Resolved streamUrl:', universalPlayerEngine.getResolvedPlayback()?.streamUrl)
  })

  it('plays via useUnifiedMusic playAlbumInContext', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const playerHook = renderHook(() => usePlayer(), { wrapper })

    const fakeFile = new File(['audio-data'], 'test-song.mp3', { type: 'audio/mp3' })
    Object.defineProperty(fakeFile, 'size', { value: 50000 })
    Object.defineProperty(fakeFile, 'lastModified', { value: 123456789 })

    const droppedItems = [{
      file: fakeFile,
      path: 'test-song.mp3',
    }]

    const dropResult = await handleDroppedMusic(droppedItems, playerHook.result.current.playLocalTracks, {
      autoPlay: false,
    })
    expect(dropResult.success).toBe(true)

    const unifiedHook = renderHook(() => useUnifiedMusic(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    console.log('unified albums:', unifiedHook.result.current.albums.length)
    const album = unifiedHook.result.current.albums[0]
    console.log('unified album:', album)

    await act(async () => {
      await unifiedHook.result.current.playAlbumInContext(album, 0)
    })

    console.log('Player status after playAlbumInContext:', universalPlayerEngine.getState().status)
    console.log('Resolved streamUrl after playAlbumInContext:', universalPlayerEngine.getResolvedPlayback()?.streamUrl)
  })

  it('simulates page reload / new session after drag-and-drop', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const playerHook = renderHook(() => usePlayer(), { wrapper })

    const fakeFile = new File(['audio-data'], 'test-song.mp3', { type: 'audio/mp3' })
    Object.defineProperty(fakeFile, 'size', { value: 50000 })
    Object.defineProperty(fakeFile, 'lastModified', { value: 123456789 })

    const droppedItems = [{
      file: fakeFile,
      path: 'test-song.mp3',
    }]

    const dropResult = await handleDroppedMusic(droppedItems, playerHook.result.current.playLocalTracks, {
      autoPlay: false,
    })
    expect(dropResult.success).toBe(true)

    // SIMULATE PAGE RELOAD / RE-OPENING OTIX:
    // Session memory map is cleared!
    clearSessionFiles()

    const unifiedHook = renderHook(() => useUnifiedMusic(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const track = unifiedHook.result.current.tracks[0]
    expect(track).toBeDefined()

    await act(async () => {
      await unifiedHook.result.current.playTrackInContext(track, unifiedHook.result.current.tracks)
    })

    console.log('Player status after reload play:', universalPlayerEngine.getState().status)
    console.log('Resolved streamUrl after reload play:', universalPlayerEngine.getResolvedPlayback()?.streamUrl)
    expect(universalPlayerEngine.getState().status).toBe('playing')
    expect(universalPlayerEngine.getResolvedPlayback()?.streamUrl).toMatch(/^blob:/)
  })

  it('simulates browser autoplay blocking on drop, and subsequent user play click', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <UniversalPlayerProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </UniversalPlayerProvider>
    )

    const playerHook = renderHook(() => usePlayer(), { wrapper })

    // In a real browser, drop is NOT a user gesture. So audio.play() rejects with NotAllowedError!
    playSpy.mockRejectedValueOnce(new DOMException('play() failed because the user didn\'t interact with the document first.', 'NotAllowedError'))

    const fakeFile = new File(['audio-data'], 'test-song.mp3', { type: 'audio/mp3' })
    Object.defineProperty(fakeFile, 'size', { value: 50000 })
    Object.defineProperty(fakeFile, 'lastModified', { value: 123456789 })

    const droppedItems = [{
      file: fakeFile,
      path: 'test-song.mp3',
    }]

    console.log('--- Calling handleDroppedMusic with default options (autoPlay = true) ---')
    await handleDroppedMusic(droppedItems, playerHook.result.current.playLocalTracks)

    console.log('Engine status after rejected autoplay:', universalPlayerEngine.getState().status)
    console.log('Engine currentItem:', universalPlayerEngine.getState().currentItem?.title)
    expect(universalPlayerEngine.getState().status).toBe('paused')

    // Now the user presses PLAY on the GlobalMusicBar (togglePlay)
    console.log('--- User presses play (togglePlay) ---')
    await act(async () => {
      await playerHook.result.current.togglePlay()
    })

    console.log('Engine status after user togglePlay 1:', universalPlayerEngine.getState().status)
    expect(universalPlayerEngine.getState().status).toBe('playing')
  })
})
