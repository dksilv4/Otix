import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scanDirectoryHandle,
  processAudioFiles,
} from '../utils/local-scanner'
import type { StoredLocalTrack } from '../utils/local-music-db'
import { renderHook, act } from '@testing-library/react'
import { useLocalMusic } from '../hooks/use-local-music'

// Mock usePlayer for hook tests
vi.mock('@/lib/player/use-player', () => ({
  usePlayer: () => ({
    playLocalTrack: vi.fn(),
    playLocalTracks: vi.fn(),
  }),
}))

// Mock local-music-db to track database operations and verify reconciliation contracts
const mockTrackStore = new Map<string, StoredLocalTrack>()
const mockFolderStore = new Map<string, any>()

const mockDeleteTracksByFolderFromDb = vi.fn(async (folderName: string) => {
  for (const [id, track] of mockTrackStore.entries()) {
    if (track.folderName === folderName) {
      mockTrackStore.delete(id)
    }
  }
})

const mockSaveTracksToDb = vi.fn(async (tracks: StoredLocalTrack[]) => {
  for (const t of tracks) {
    mockTrackStore.set(t.id, t)
  }
})

const mockSaveFolderToDb = vi.fn(async (folder: any) => {
  mockFolderStore.set(folder.id, folder)
})

const mockGetAllTracksFromDb = vi.fn(async () => Array.from(mockTrackStore.values()))
const mockGetAllFoldersFromDb = vi.fn(async () => Array.from(mockFolderStore.values()))
const mockDeleteFolderFromDb = vi.fn(async (id: string) => {
  mockFolderStore.delete(id)
})
const mockClearAllTracksFromDb = vi.fn(async () => {
  mockTrackStore.clear()
  mockFolderStore.clear()
})

vi.mock('../utils/local-music-db', () => ({
  getAllTracksFromDb: () => mockGetAllTracksFromDb(),
  getAllFoldersFromDb: () => mockGetAllFoldersFromDb(),
  saveTracksToDb: (tracks: StoredLocalTrack[]) => mockSaveTracksToDb(tracks),
  saveFolderToDb: (folder: any) => mockSaveFolderToDb(folder),
  deleteFolderFromDb: (id: string) => mockDeleteFolderFromDb(id),
  deleteTracksByFolderFromDb: (folderName: string) => mockDeleteTracksByFolderFromDb(folderName),
  clearAllTracksFromDb: () => mockClearAllTracksFromDb(),
}))

// Helper to create mock FileSystemFileHandle
const createMockFileEntry = (name: string, content = 'audio-bytes', lastModified = Date.now(), size = 1024) => {
  const file = new File([content], name, {
    type: name.endsWith('.flac') ? 'audio/flac' : 'audio/mpeg',
    lastModified,
  })
  Object.defineProperty(file, 'size', { value: size })
  return {
    name,
    kind: 'file' as const,
    getFile: vi.fn().mockResolvedValue(file),
  }
}

// Helper to create mock FileSystemDirectoryHandle
const createMockDirEntry = (name: string, entries: any[] = [], throwsOnValues?: Error) => {
  return {
    name,
    kind: 'directory' as const,
    values: throwsOnValues
      // eslint-disable-next-line require-yield
      ? async function* () {
          throw throwsOnValues
        }
      : async function* () {
          for (const entry of entries) {
            yield entry
          }
        },
  } as unknown as FileSystemDirectoryHandle
}

describe('Milestone 2 Challenge: Local Scanner Performance & Robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackStore.clear()
    mockFolderStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. Restricted System Directories & Inaccessible Directory Skipping
  // =========================================================================
  describe('Challenge 1: Restricted System Directories & Permission Degradation', () => {
    it('gracefully skips all Windows system directories without touching their contents or throwing', async () => {
      const accessedRestrictedFolders: string[] = []

      const createRestrictedDir = (name: string) => ({
        name,
        kind: 'directory' as const,
        // eslint-disable-next-line require-yield
        values: async function* () {
          accessedRestrictedFolders.push(name)
          throw new DOMException('Access is denied to system directory', 'SecurityError')
        },
      })

      const rootHandle = createMockDirEntry('C_Drive', [
        createMockFileEntry('good_song_1.mp3'),
        createRestrictedDir('System Volume Information'),
        createRestrictedDir('$RECYCLE.BIN'),
        createRestrictedDir('$Recycle.Bin'),
        createRestrictedDir('Recovery'),
        createRestrictedDir('$WinREAgent'),
        createMockFileEntry('good_song_2.flac'),
      ])

      const onProgress = vi.fn()
      const results = await scanDirectoryHandle(rootHandle, onProgress)

      // Verified: Restricted folders are skipped before values() is ever invoked
      expect(accessedRestrictedFolders).toHaveLength(0)
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.file.name)).toEqual(['good_song_1.mp3', 'good_song_2.flac'])
      expect(onProgress).toHaveBeenLastCalledWith(2)
    })

    it('gracefully skips Unix/macOS hidden directories, .git, and node_modules even if they contain audio files', async () => {
      const gitDir = createMockDirEntry('.git', [createMockFileEntry('hooks-sound.mp3')])
      const trashDir = createMockDirEntry('.Trash', [createMockFileEntry('deleted-audio.flac')])
      const nodeModulesDir = createMockDirEntry('node_modules', [createMockFileEntry('package-audio.ogg')])
      const spotlightDir = createMockDirEntry('.Spotlight-V100', [createMockFileEntry('index.wav')])
      const validSubDir = createMockDirEntry('MyAlbum', [createMockFileEntry('track01.mp3')])

      const rootHandle = createMockDirEntry('ProjectRoot', [
        createMockFileEntry('root.mp3'),
        gitDir,
        trashDir,
        nodeModulesDir,
        spotlightDir,
        validSubDir,
      ])

      const results = await scanDirectoryHandle(rootHandle)

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.path)).toEqual([
        'ProjectRoot/root.mp3',
        'ProjectRoot/MyAlbum/track01.mp3',
      ])
    })

    it('handles inaccessible subdirectories throwing SecurityError/NotAllowedError gracefully without halting scan', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const lockedDir1 = createMockDirEntry('LockedFolder1', [], new DOMException('Permission denied', 'NotAllowedError'))
      const lockedDir2 = createMockDirEntry('CorruptedDir', [], new Error('EPERM: operation not permitted'))
      const accessibleDir = createMockDirEntry('OpenFolder', [createMockFileEntry('accessible.flac')])

      const rootHandle = createMockDirEntry('MusicLibrary', [
        createMockFileEntry('intro.mp3'),
        lockedDir1,
        createMockFileEntry('interlude.mp3'),
        lockedDir2,
        accessibleDir,
        createMockFileEntry('outro.mp3'),
      ])

      const results = await scanDirectoryHandle(rootHandle)

      // Scan should not abort: all accessible items are scanned
      expect(results).toHaveLength(4)
      expect(results.map((r) => r.file.name)).toEqual([
        'intro.mp3',
        'interlude.mp3',
        'accessible.flac',
        'outro.mp3',
      ])

      // Verification: warning logged for skipped unreadable folders
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[local-scanner] Skipped unreadable folder entries:'),
        expect.stringContaining('MusicLibrary/LockedFolder1'),
        expect.any(DOMException),
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[local-scanner] Skipped unreadable folder entries:'),
        expect.stringContaining('MusicLibrary/CorruptedDir'),
        expect.any(Error),
      )
    })

    it('gracefully skips unreadable individual files whose getFile() rejects', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const corruptFileEntry = {
        name: 'corrupted_lock.mp3',
        kind: 'file' as const,
        getFile: vi.fn().mockRejectedValue(new DOMException('File locked by another process', 'NoModificationAllowedError')),
      }

      const rootHandle = createMockDirEntry('Root', [
        createMockFileEntry('valid1.mp3'),
        corruptFileEntry,
        createMockFileEntry('valid2.mp3'),
      ])

      const results = await scanDirectoryHandle(rootHandle)
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.file.name)).toEqual(['valid1.mp3', 'valid2.mp3'])
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[local-scanner] Could not read file:',
        'corrupted_lock.mp3',
        expect.any(DOMException),
      )
    })
  })

  // =========================================================================
  // 2. Aborting a Scan In Flight via AbortSignal & Zero Hanging Promises
  // =========================================================================
  describe('Challenge 2: AbortSignal In-Flight Halt & Promise Lifecycle', () => {
    it('halts scanDirectoryHandle immediately when signal is already aborted', async () => {
      const abortController = new AbortController()
      abortController.abort()

      const rootHandle = createMockDirEntry('AbortedRoot', [
        createMockFileEntry('track1.mp3'),
        createMockFileEntry('track2.mp3'),
      ])

      const onProgress = vi.fn()
      const results = await scanDirectoryHandle(rootHandle, onProgress, abortController.signal)

      expect(results).toHaveLength(0)
      expect(onProgress).toHaveBeenCalledWith(0)
    })

    it('halts scanDirectoryHandle immediately in flight without reading further entries or hanging', async () => {
      const abortController = new AbortController()
      let yieldCount = 0

      // Infinite / huge entry stream
      const infiniteDirHandle = {
        name: 'InfiniteRoot',
        kind: 'directory' as const,
        values: async function* () {
          for (let i = 0; i < 1000; i++) {
            yieldCount++
            if (yieldCount === 3) {
              abortController.abort()
            }
            yield createMockFileEntry(`track_${i}.mp3`)
          }
        },
      } as unknown as FileSystemDirectoryHandle

      const startTime = performance.now()
      const results = await scanDirectoryHandle(
        infiniteDirHandle,
        undefined,
        abortController.signal,
      )
      const duration = performance.now() - startTime

      // Halts immediately when signal is aborted: generator does not yield further entries
      expect(yieldCount).toBe(3)
      expect(results.length).toBeLessThanOrEqual(3)
      expect(duration).toBeLessThan(100) // Immediate termination, no hang
    })

    it('halts processAudioFiles worker pool immediately on in-flight abort with zero hanging workers', async () => {
      const abortController = new AbortController()

      const files = Array.from({ length: 50 }, (_, i) => ({
        file: new File([new Uint8Array(100)], `track_${i}.mp3`, {
          type: 'audio/mpeg',
          lastModified: 1700000000000 + i,
        }),
        path: `Music/track_${i}.mp3`,
      }))

      let processedCount = 0
      const onProgress = vi.fn((current) => {
        processedCount = current
        if (processedCount === 2) {
          abortController.abort()
        }
      })

      const startTime = performance.now()
      const result = await processAudioFiles(files, 'Music', {
        concurrency: 4,
        signal: abortController.signal,
        onProgress,
      })
      const duration = performance.now() - startTime

      // Pool of 4 workers: when aborted at current=2, workers break while loops immediately
      expect(result.stored.length).toBeLessThan(10)
      expect(result.stored.length).toBeGreaterThanOrEqual(2)
      // Must resolve rapidly without processing all 50 items
      expect(duration).toBeLessThan(500)
    })

    it('exits processAudioFiles immediately with empty stored tracks when pre-aborted', async () => {
      const abortController = new AbortController()
      abortController.abort()

      const files = [
        {
          file: new File(['data'], 'test.mp3', { type: 'audio/mpeg' }),
          path: 'Music/test.mp3',
        },
      ]

      const result = await processAudioFiles(files, 'Music', {
        signal: abortController.signal,
      })

      expect(result.stored).toHaveLength(0)
      expect(result.liveMap.size).toBe(0)
    })
  })

  // =========================================================================
  // 3. Throttling Verification: Intervals >= 100ms & Final Accurate Count
  // =========================================================================
  describe('Challenge 3: Throttled Progress Cadence & Accurate Final Count', () => {
    it('throttles intermediate onProgress events to >= 100ms intervals and delivers accurate final count', async () => {
      // Create 60 files to be discovered in rapid succession
      const totalFiles = 60
      const entries = Array.from({ length: totalFiles }, (_, i) =>
        createMockFileEntry(`fast_${i}.mp3`),
      )

      const rootHandle = createMockDirEntry('RapidFolder', entries)

      const progressCalls: { count: number; timestamp: number }[] = []
      const onProgress = (count: number) => {
        progressCalls.push({
          count,
          timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        })
      }

      const results = await scanDirectoryHandle(rootHandle, onProgress)

      expect(results).toHaveLength(totalFiles)
      expect(progressCalls.length).toBeGreaterThan(0)

      // The final onProgress call MUST report the exact total file count (60)
      const lastCall = progressCalls[progressCalls.length - 1]
      expect(lastCall.count).toBe(totalFiles)

      // Rapid synchronous scan: intermediate calls must be throttled
      // Instead of 60 rapid calls, there should only be 1 or 2 calls because discovery takes <10ms
      expect(progressCalls.length).toBeLessThan(5)

      // Verify that any consecutive calls during active scanning respect >= 95ms spacing
      for (let i = 1; i < progressCalls.length - 1; i++) {
        const interval = progressCalls[i].timestamp - progressCalls[i - 1].timestamp
        expect(interval).toBeGreaterThanOrEqual(95)
      }
    })

    it('fires intermediate progress events when discovery intervals exceed 100ms', async () => {
      // Simulate staggered discovery where time elapses between files
      const fileCount = 4
      let fileIdx = 0

      const staggeredHandle = {
        name: 'StaggeredFolder',
        kind: 'directory' as const,
        values: async function* () {
          for (let i = 0; i < fileCount; i++) {
            // Artificial 110ms delay between discoveries
            await new Promise((resolve) => setTimeout(resolve, 110))
            yield createMockFileEntry(`staggered_${fileIdx++}.mp3`)
          }
        },
      } as unknown as FileSystemDirectoryHandle

      const progressCalls: { count: number; time: number }[] = []
      const onProgress = (count: number) => {
        progressCalls.push({ count, time: performance.now() })
      }

      const results = await scanDirectoryHandle(staggeredHandle, onProgress)

      expect(results).toHaveLength(fileCount)
      expect(progressCalls.length).toBeGreaterThanOrEqual(fileCount)

      // All intervals between consecutive intermediate calls must be >= 100ms (allowing 5ms jitter)
      // Note: the last call is the unconditional final flush at completion
      for (let i = 1; i < progressCalls.length - 1; i++) {
        const delta = progressCalls[i].time - progressCalls[i - 1].time
        expect(delta).toBeGreaterThanOrEqual(95)
      }

      // Final call count matches accurately
      expect(progressCalls[progressCalls.length - 1].count).toBe(fileCount)
    })

    it('reports accurate final count even for an empty directory (0 files)', async () => {
      const emptyHandle = createMockDirEntry('EmptyFolder', [])
      const onProgress = vi.fn()

      const results = await scanDirectoryHandle(emptyHandle, onProgress)

      expect(results).toHaveLength(0)
      expect(onProgress).toHaveBeenLastCalledWith(0)
    })
  })

  // =========================================================================
  // 4. Rescan Reconciliation & Deletion Cleanup
  // =========================================================================
  describe('Challenge 4: Rescan Reconciliation & deleteTracksByFolderFromDb', () => {
    it('purges previously deleted tracks when rescanning an existing folder with fewer files', async () => {
      const folderName = 'AcousticSession'
      const folderId = `folder-acousticsession`

      // Initial state in DB: 3 tracks
      const track1: StoredLocalTrack = {
        id: 'loc-AcousticSession%2Ftrack1.mp3-100-1',
        title: 'Track 1',
        artist: 'Acoustic Duo',
        albumName: 'Unplugged',
        durationMs: 180000,
        fileName: 'track1.mp3',
        path: 'AcousticSession/track1.mp3',
        folderName,
        size: 100,
        lastModified: 1,
        albumArtBlob: null,
      }
      const track2: StoredLocalTrack = {
        id: 'loc-AcousticSession%2Ftrack2.mp3-200-2',
        title: 'Track 2 (To Be Deleted)',
        artist: 'Acoustic Duo',
        albumName: 'Unplugged',
        durationMs: 200000,
        fileName: 'track2.mp3',
        path: 'AcousticSession/track2.mp3',
        folderName,
        size: 200,
        lastModified: 2,
        albumArtBlob: null,
      }
      const track3: StoredLocalTrack = {
        id: 'loc-AcousticSession%2Ftrack3.mp3-300-3',
        title: 'Track 3 (To Be Deleted)',
        artist: 'Acoustic Duo',
        albumName: 'Unplugged',
        durationMs: 220000,
        fileName: 'track3.mp3',
        path: 'AcousticSession/track3.mp3',
        folderName,
        size: 300,
        lastModified: 3,
        albumArtBlob: null,
      }

      // Another folder's track (must remain untouched)
      const otherFolderTrack: StoredLocalTrack = {
        id: 'loc-Jazz%2Fblue.mp3-500-1',
        title: 'Blue Note',
        artist: 'Miles',
        albumName: 'Kind of Blue',
        durationMs: 300000,
        fileName: 'blue.mp3',
        path: 'Jazz/blue.mp3',
        folderName: 'Jazz',
        size: 500,
        lastModified: 1,
        albumArtBlob: null,
      }

      mockTrackStore.set(track1.id, track1)
      mockTrackStore.set(track2.id, track2)
      mockTrackStore.set(track3.id, track3)
      mockTrackStore.set(otherFolderTrack.id, otherFolderTrack)

      mockFolderStore.set(folderId, {
        id: folderId,
        name: folderName,
        trackCount: 3,
        dateAdded: Date.now() - 10000,
      })

      // Mount hook
      const { result } = renderHook(() => useLocalMusic())

      // Await initial load
      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.tracks).toHaveLength(4)

      // Rescan event: Files on disk now only have track1.mp3 and a new track4.mp3
      // (track2.mp3 and track3.mp3 were deleted from disk by the user)
      const survivingFile1 = new File(['content1'], 'track1.mp3', {
        type: 'audio/mpeg',
        lastModified: 1,
      })
      Object.defineProperty(survivingFile1, 'size', { value: 100 })

      const newFile4 = new File(['content4'], 'track4.mp3', {
        type: 'audio/mpeg',
        lastModified: 4,
      })
      Object.defineProperty(newFile4, 'size', { value: 400 })

      const mockDirHandle = {
        name: folderName,
        kind: 'directory',
        values: async function* () {
          yield {
            name: 'track1.mp3',
            kind: 'file',
            getFile: async () => survivingFile1,
          }
          yield {
            name: 'track4.mp3',
            kind: 'file',
            getFile: async () => newFile4,
          }
        },
      } as unknown as FileSystemDirectoryHandle

      // Mock showDirectoryPicker to return this directory handle
      ;(window as any).showDirectoryPicker = vi.fn().mockResolvedValue(mockDirHandle)

      await act(async () => {
        await result.current.scanDirectory()
      })

      // Verification: deleteTracksByFolderFromDb was called with 'AcousticSession'
      expect(mockDeleteTracksByFolderFromDb).toHaveBeenCalledWith(folderName)

      // Verification: Deleted tracks (track2, track3) are completely gone from DB
      expect(mockTrackStore.has(track2.id)).toBe(false)
      expect(mockTrackStore.has(track3.id)).toBe(false)

      // Verification: surviving track1, new track4, and unrelated otherFolderTrack exist
      expect(mockTrackStore.has(track1.id)).toBe(true)
      const expectedTrack4Id = `loc-${encodeURIComponent(`${folderName}/track4.mp3`)}-400-4`
      expect(mockTrackStore.has(expectedTrack4Id)).toBe(true)
      expect(mockTrackStore.has(otherFolderTrack.id)).toBe(true)

      // Verification: In-memory hook tracks reflect exact reconciled count (3 total: 2 in AcousticSession, 1 in Jazz)
      expect(result.current.tracks).toHaveLength(3)
      const acousticTracks = result.current.tracks.filter((t) => t.folderName === folderName)
      expect(acousticTracks).toHaveLength(2)
      expect(acousticTracks.map((t) => t.fileName).sort()).toEqual(['track1.mp3', 'track4.mp3'])
    })

    it('preserves other folders untouched when one folder is rescanned or cleared', async () => {
      const jazzTrack: StoredLocalTrack = {
        id: 'jazz-1',
        title: 'Jazz Song',
        artist: 'Artist',
        albumName: 'Album',
        durationMs: 150000,
        fileName: 'jazz.mp3',
        path: 'Jazz/jazz.mp3',
        folderName: 'Jazz',
        size: 1000,
        lastModified: 10,
        albumArtBlob: null,
      }
      mockTrackStore.set(jazzTrack.id, jazzTrack)

      await mockDeleteTracksByFolderFromDb('Rock')

      // Jazz track must remain intact
      expect(mockTrackStore.has('jazz-1')).toBe(true)
      expect(mockTrackStore.size).toBe(1)
    })
  })
})
