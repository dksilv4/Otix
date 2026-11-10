import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalMusic } from '../use-local-music'
import type { StoredLocalTrack, StoredFolder } from '../../utils/local-music-db'

// Mock dependencies
const mockPlayLocalTrack = vi.fn()
const mockPlayLocalTracks = vi.fn()

vi.mock('@/lib/player/use-player', () => ({
  usePlayer: () => ({
    playLocalTrack: mockPlayLocalTrack,
    playLocalTracks: mockPlayLocalTracks,
  }),
}))

let mockDbTracks: StoredLocalTrack[] = []
let mockDbFolders: StoredFolder[] = []

vi.mock('../../utils/local-music-db', () => ({
  getAllTracksFromDb: vi.fn(async () => mockDbTracks),
  getAllFoldersFromDb: vi.fn(async () => mockDbFolders),
  saveTracksToDb: vi.fn(async () => {}),
  saveFolderToDb: vi.fn(async () => {}),
  deleteFolderFromDb: vi.fn(async () => {}),
  deleteTracksByFolderFromDb: vi.fn(async () => {}),
  clearAllTracksFromDb: vi.fn(async () => {
    mockDbTracks = []
    mockDbFolders = []
  }),
  saveAudioBlobToDb: vi.fn(async () => {}),
  getAudioBlobFromDb: vi.fn(async () => null),
}))

describe('useLocalMusic — Session File Handle Resolution (resolveFileForTrack)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbTracks = []
    mockDbFolders = []
  })

  it('successfully re-hydrates file references when directory handle is present and permission is granted', async () => {
    const mockFile = new File(['audio-binary-data'], 'rock_anthem.mp3', { type: 'audio/mpeg' })
    const mockFileHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    }
    const mockDirHandle = {
      name: 'RockCollection',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    }

    const testFolder: StoredFolder = {
      id: 'folder-1',
      name: 'RockCollection',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-granted-101',
      title: 'Rock Anthem',
      artist: 'Rockers',
      albumName: 'Rock Album',
      trackNumber: 1,
      year: '2024',
      durationMs: 215000,
      albumArtBlob: null,
      path: 'RockCollection/rock_anthem.mp3',
      fileName: 'rock_anthem.mp3',
      size: 5000000,
      lastModified: Date.now(),
      folderName: 'RockCollection',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    // Wait for initial DB load
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.folders).toHaveLength(1)

    // Re-hydrate track file
    let resolvedFile: File | null = null
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(resolvedFile).toBe(mockFile)
    expect(mockDirHandle.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('rock_anthem.mp3')
    expect(mockFileHandle.getFile).toHaveBeenCalledTimes(1)

    // Second call should return cached file from sessionFileMap without querying directory handle again
    let cachedFile: File | null = null
    await act(async () => {
      cachedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(cachedFile).toBe(mockFile)
    expect(mockDirHandle.getFileHandle).toHaveBeenCalledTimes(1) // Still 1!
  })

  it('fails gracefully and returns null when directory handle permission is denied', async () => {
    const mockDirHandle = {
      name: 'DeniedFolder',
      queryPermission: vi.fn().mockResolvedValue('denied'),
      getFileHandle: vi.fn(),
    }

    const testFolder: StoredFolder = {
      id: 'folder-denied-2',
      name: 'DeniedFolder',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-denied-202',
      title: 'Denied Track',
      artist: 'Unknown',
      albumName: 'Secret Album',
      trackNumber: 1,
      year: '2024',
      durationMs: 180000,
      albumArtBlob: null,
      path: 'DeniedFolder/track.mp3',
      fileName: 'track.mp3',
      size: 4000000,
      lastModified: Date.now(),
      folderName: 'DeniedFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    let resolvedFile: File | null = null
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(resolvedFile).toBe(null)
    expect(mockDirHandle.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(mockDirHandle.getFileHandle).not.toHaveBeenCalled()
  })

  it('fails gracefully and returns null when queryPermission rejects with an error', async () => {
    const mockDirHandle = {
      name: 'ErrorFolder',
      queryPermission: vi.fn().mockRejectedValue(new Error('Permission prompt dismissed by user')),
      getFileHandle: vi.fn(),
    }

    const testFolder: StoredFolder = {
      id: 'folder-err-3',
      name: 'ErrorFolder',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-err-303',
      title: 'Error Track',
      artist: 'Unknown',
      albumName: 'Glitch',
      trackNumber: 1,
      year: '2024',
      durationMs: 120000,
      albumArtBlob: null,
      path: 'ErrorFolder/error.mp3',
      fileName: 'error.mp3',
      size: 3000000,
      lastModified: Date.now(),
      folderName: 'ErrorFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    let resolvedFile: File | null = 'not-null' as unknown as File
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    // Must catch gracefully and return null without throwing
    expect(resolvedFile).toBe(null)
    expect(mockDirHandle.getFileHandle).not.toHaveBeenCalled()
  })

  it('fails gracefully and returns null when getFileHandle rejects with NotFoundError', async () => {
    const mockDirHandle = {
      name: 'MissingFilesFolder',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockRejectedValue(new DOMException('A requested file could not be found', 'NotFoundError')),
    }

    const testFolder: StoredFolder = {
      id: 'folder-missing-4',
      name: 'MissingFilesFolder',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-missing-404',
      title: 'Deleted Track',
      artist: 'Ghost',
      albumName: 'Vanish',
      trackNumber: 1,
      year: '2024',
      durationMs: 150000,
      albumArtBlob: null,
      path: 'MissingFilesFolder/vanished.mp3',
      fileName: 'vanished.mp3',
      size: 3500000,
      lastModified: Date.now(),
      folderName: 'MissingFilesFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    let resolvedFile: File | null = 'not-null' as unknown as File
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(resolvedFile).toBe(null)
  })

  it('returns null immediately when folder handle is missing (e.g. input-imported files)', async () => {
    const testFolder: StoredFolder = {
      id: 'folder-nohandle-5',
      name: 'NoHandleFolder',
      handle: undefined, // No handle
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-nohandle-505',
      title: 'No Handle Track',
      artist: 'Browser',
      albumName: 'Legacy',
      trackNumber: 1,
      year: '2024',
      durationMs: 175000,
      albumArtBlob: null,
      path: 'NoHandleFolder/legacy.mp3',
      fileName: 'legacy.mp3',
      size: 4000000,
      lastModified: Date.now(),
      folderName: 'NoHandleFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    let resolvedFile: File | null = 'not-null' as unknown as File
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(resolvedFile).toBe(null)
  })

  it('returns null immediately when track folderName does not match any known folder', async () => {
    const testTrack: StoredLocalTrack = {
      id: 'track-orphan-606',
      title: 'Orphan Track',
      artist: 'Solo',
      albumName: 'Nowhere',
      trackNumber: 1,
      year: '2024',
      durationMs: 190000,
      albumArtBlob: null,
      path: 'UnknownFolder/solo.mp3',
      fileName: 'solo.mp3',
      size: 4500000,
      lastModified: Date.now(),
      folderName: 'UnknownFolder',
    }

    mockDbFolders = []
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    let resolvedFile: File | null = 'not-null' as unknown as File
    await act(async () => {
      resolvedFile = await result.current.resolveFileForTrack(testTrack)
    })

    expect(resolvedFile).toBe(null)
  })

  it('integrates with playTrack to automatically re-hydrate file reference and construct playable track', async () => {
    const mockFile = new File(['song-stream'], 'song.mp3', { type: 'audio/mpeg' })
    const mockFileHandle = {
      getFile: vi.fn().mockResolvedValue(mockFile),
    }
    const mockDirHandle = {
      name: 'LibraryFolder',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
    }

    const testFolder: StoredFolder = {
      id: 'folder-lib-7',
      name: 'LibraryFolder',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 1,
    }

    const testTrack: StoredLocalTrack = {
      id: 'track-play-707',
      title: 'Symphony',
      artist: 'Orchestra',
      albumName: 'Classical',
      trackNumber: 1,
      year: '2024',
      durationMs: 300000,
      albumArtBlob: null,
      path: 'LibraryFolder/song.mp3',
      fileName: 'song.mp3',
      size: 8000000,
      lastModified: Date.now(),
      folderName: 'LibraryFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [testTrack]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.playTrack(testTrack)
    })

    expect(mockPlayLocalTrack).toHaveBeenCalledTimes(1)
    const passedTrack = mockPlayLocalTrack.mock.calls[0][0]
    expect(passedTrack.title).toBe('Symphony')
    expect(passedTrack.file).toBe(mockFile)
    expect(passedTrack.url).toBeTruthy()
  })

  it('integrates with playTracksInContext to resolve multiple tracks in parallel', async () => {
    const mockFile1 = new File(['f1'], 't1.mp3', { type: 'audio/mpeg' })
    const mockFile2 = new File(['f2'], 't2.mp3', { type: 'audio/mpeg' })

    const mockDirHandle = {
      name: 'AlbumFolder',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFileHandle: vi.fn().mockImplementation(async (name: string) => {
        if (name === 't1.mp3') return { getFile: async () => mockFile1 }
        if (name === 't2.mp3') return { getFile: async () => mockFile2 }
        throw new Error('Not found')
      }),
    }

    const testFolder: StoredFolder = {
      id: 'folder-album-8',
      name: 'AlbumFolder',
      handle: mockDirHandle as unknown as FileSystemDirectoryHandle,
      dateAdded: Date.now(),
      trackCount: 2,
    }

    const track1: StoredLocalTrack = {
      id: 'track-multi-801',
      title: 'Track 1',
      artist: 'Duo',
      albumName: 'EP',
      trackNumber: 1,
      year: '2024',
      durationMs: 120000,
      albumArtBlob: null,
      path: 'AlbumFolder/t1.mp3',
      fileName: 't1.mp3',
      size: 2000000,
      lastModified: Date.now(),
      folderName: 'AlbumFolder',
    }

    const track2: StoredLocalTrack = {
      id: 'track-multi-802',
      title: 'Track 2',
      artist: 'Duo',
      albumName: 'EP',
      trackNumber: 2,
      year: '2024',
      durationMs: 140000,
      albumArtBlob: null,
      path: 'AlbumFolder/t2.mp3',
      fileName: 't2.mp3',
      size: 2500000,
      lastModified: Date.now(),
      folderName: 'AlbumFolder',
    }

    mockDbFolders = [testFolder]
    mockDbTracks = [track1, track2]

    const { result } = renderHook(() => useLocalMusic())

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.playTracksInContext([track1, track2], 0)
    })

    expect(mockPlayLocalTracks).toHaveBeenCalledTimes(1)
    const passedTracks = mockPlayLocalTracks.mock.calls[0][0]
    expect(passedTracks).toHaveLength(2)
    expect(passedTracks[0].file).toBe(mockFile1)
    expect(passedTracks[1].file).toBe(mockFile2)
  })
})
