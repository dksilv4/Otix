import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDroppedMusic } from '../drop-music-handler'
import type { ExtractedDroppedItem } from '../drop-extractor'
import type { StoredLocalTrack } from '@/features/music/local/utils/local-music-db'
import { getSessionFile, clearSessionFiles } from '@/features/music/local/utils/session-file-map'

const mockShowToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  showToast: (args: any) => mockShowToast(args),
}))

const mockSaveTracksToDb = vi.fn().mockResolvedValue(undefined)
const mockSaveFolderToDb = vi.fn().mockResolvedValue(undefined)
const mockSaveAudioBlobToDb = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/music/local/utils/local-music-db', () => ({
  saveTracksToDb: (t: any) => mockSaveTracksToDb(t),
  saveFolderToDb: (f: any) => mockSaveFolderToDb(f),
  saveAudioBlobToDb: (id: string, b: any) => mockSaveAudioBlobToDb(id, b),
  getAudioBlobFromDb: vi.fn().mockResolvedValue(null),
}))

const mockProcessAudioFiles = vi.fn()
vi.mock('@/features/music/local/utils/local-scanner', () => ({
  isAudioFile: (name: string) => /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$/i.test(name),
  processAudioFiles: (...args: any[]) => mockProcessAudioFiles(...args),
  buildLocalTrackInfo: (stored: StoredLocalTrack, file?: File) => ({
    id: stored.id,
    file,
    url: 'blob://mock-url',
    title: stored.title,
    artist: stored.artist,
    albumName: stored.albumName,
    albumArt: null,
    durationMs: stored.durationMs,
  }),
}))

describe('drop-music-handler', () => {
  const mockPlayLocalTracks = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionFiles()
  })

  it('handles empty dropped item list gracefully', async () => {
    const res = await handleDroppedMusic([], mockPlayLocalTracks)
    expect(res.success).toBe(false)
    expect(res.reason).toBe('empty-drop')
    expect(mockPlayLocalTracks).not.toHaveBeenCalled()
  })

  it('warns user when only non-audio files are dropped', async () => {
    const droppedDoc: ExtractedDroppedItem = {
      file: new File(['text'], 'notes.txt', { type: 'text/plain' }),
      path: 'notes.txt',
    }

    const res = await handleDroppedMusic([droppedDoc], mockPlayLocalTracks)
    expect(res.success).toBe(false)
    expect(res.reason).toBe('no-audio-files')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No audio files found',
        variant: 'warning',
      }),
    )
    expect(mockPlayLocalTracks).not.toHaveBeenCalled()
  })

  it('processes, saves, caches, and automatically plays single dropped audio file', async () => {
    const audioFile = new File(['mp3-audio-bytes'], 'summer_vibes.mp3', { type: 'audio/mpeg' })
    const droppedItem: ExtractedDroppedItem = {
      file: audioFile,
      path: 'summer_vibes.mp3',
    }

    const parsedTrack: StoredLocalTrack = {
      id: 'loc-track-123',
      title: 'Summer Vibes',
      artist: 'Ocean Waves',
      albumName: 'Sunny Days',
      trackNumber: 1,
      year: '2025',
      durationMs: 180000,
      albumArtBlob: null,
      path: 'summer_vibes.mp3',
      fileName: 'summer_vibes.mp3',
      size: 1024,
      lastModified: Date.now(),
      folderName: 'Dropped Music',
    }

    mockProcessAudioFiles.mockImplementation(async (items, folderName, opts) => {
      opts?.onTrackParsed?.(parsedTrack, audioFile)
      const liveMap = new Map<string, File>()
      liveMap.set(parsedTrack.id, audioFile)
      return { stored: [parsedTrack], liveMap }
    })

    const listener = vi.fn()
    window.addEventListener('otix:local-music-updated', listener)

    const res = await handleDroppedMusic([droppedItem], mockPlayLocalTracks)

    expect(res.success).toBe(true)
    expect(res.audioCount).toBe(1)
    expect(mockSaveTracksToDb).toHaveBeenCalledWith([parsedTrack])
    expect(mockSaveFolderToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-dropped_music',
        name: 'Dropped Music',
        trackCount: 1,
      }),
    )
    expect(listener).toHaveBeenCalled()
    expect(getSessionFile(parsedTrack.id)).toBe(audioFile)
    expect(mockPlayLocalTracks).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'loc-track-123',
          title: 'Summer Vibes',
          artist: 'Ocean Waves',
        }),
      ],
      0,
    )
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Playing "Summer Vibes"',
        variant: 'success',
      }),
    )

    window.removeEventListener('otix:local-music-updated', listener)
  })

  it('processes and queues multiple dropped tracks under album folder name', async () => {
    const file1 = new File(['mp3'], '01.mp3', { type: 'audio/mpeg' })
    const file2 = new File(['flac'], '02.flac', { type: 'audio/flac' })

    const droppedItems: ExtractedDroppedItem[] = [
      { file: file1, path: 'DarkSideOfTheMoon/01.mp3', folderName: 'DarkSideOfTheMoon' },
      { file: file2, path: 'DarkSideOfTheMoon/02.flac', folderName: 'DarkSideOfTheMoon' },
    ]

    const track1: StoredLocalTrack = {
      id: 'track-1',
      title: 'Speak to Me',
      artist: 'Pink Floyd',
      albumName: 'Dark Side of the Moon',
      trackNumber: 1,
      year: '1973',
      durationMs: 90000,
      albumArtBlob: null,
      path: 'DarkSideOfTheMoon/01.mp3',
      fileName: '01.mp3',
      size: 500,
      lastModified: Date.now(),
      folderName: 'DarkSideOfTheMoon',
    }

    const track2: StoredLocalTrack = {
      id: 'track-2',
      title: 'Breathe',
      artist: 'Pink Floyd',
      albumName: 'Dark Side of the Moon',
      trackNumber: 2,
      year: '1973',
      durationMs: 163000,
      albumArtBlob: null,
      path: 'DarkSideOfTheMoon/02.flac',
      fileName: '02.flac',
      size: 800,
      lastModified: Date.now(),
      folderName: 'DarkSideOfTheMoon',
    }

    mockProcessAudioFiles.mockImplementation(async (items, folderName, opts) => {
      opts?.onTrackParsed?.(track1, file1)
      opts?.onTrackParsed?.(track2, file2)
      const liveMap = new Map<string, File>()
      liveMap.set(track1.id, file1)
      liveMap.set(track2.id, file2)
      return { stored: [track1, track2], liveMap }
    })

    const res = await handleDroppedMusic(droppedItems, mockPlayLocalTracks)

    expect(res.success).toBe(true)
    expect(res.audioCount).toBe(2)
    expect(mockSaveFolderToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'folder-darksideofthemoon',
        name: 'DarkSideOfTheMoon',
        trackCount: 2,
      }),
    )
    expect(mockPlayLocalTracks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'track-1', title: 'Speak to Me' }),
        expect.objectContaining({ id: 'track-2', title: 'Breathe' }),
      ]),
      0,
    )
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Playing "Speak to Me"',
        description: 'Added 2 tracks to "DarkSideOfTheMoon"',
      }),
    )
  })
})
