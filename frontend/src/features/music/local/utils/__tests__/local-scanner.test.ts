import { describe, it, expect, vi } from 'vitest'
import { processAudioFiles, isAudioFile, buildLocalTrackInfo } from '../local-scanner'
import type { StoredLocalTrack } from '../local-music-db'

describe('local-scanner', () => {
  it('identifies audio file extensions correctly', () => {
    expect(isAudioFile('song.mp3')).toBe(true)
    expect(isAudioFile('track.FLAC')).toBe(true)
    expect(isAudioFile('audio.m4a')).toBe(true)
    expect(isAudioFile('tune.wav')).toBe(true)
    expect(isAudioFile('video.mp4')).toBe(false)
    expect(isAudioFile('image.png')).toBe(false)
    expect(isAudioFile('noext')).toBe(false)
  })

  it('streams parsed tracks in real time via onTrackParsed', async () => {
    const fakeFile1 = new File([new Uint8Array(100)], 'song1.mp3', { type: 'audio/mpeg' })
    const fakeFile2 = new File([new Uint8Array(100)], 'song2.mp3', { type: 'audio/mpeg' })

    const streamedTracks: StoredLocalTrack[] = []
    const onTrackParsed = vi.fn((track: StoredLocalTrack) => {
      streamedTracks.push(track)
    })
    const onProgress = vi.fn()

    const items = [
      { file: fakeFile1, path: 'Music/song1.mp3' },
      { file: fakeFile2, path: 'Music/song2.mp3' },
    ]

    const result = await processAudioFiles(items, 'Music', {
      onProgress,
      onTrackParsed,
      concurrency: 2,
    })

    expect(result.stored).toHaveLength(2)
    expect(streamedTracks).toHaveLength(2)
    expect(onTrackParsed).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledWith(1, 2)
    expect(onProgress).toHaveBeenCalledWith(2, 2)
    expect(result.liveMap.size).toBe(2)
  })

  it('buildLocalTrackInfo caches blob and file URLs via getOrCreateBlobUrl', () => {
    const fakeFile = new File([new Uint8Array(50)], 'cached.mp3', { type: 'audio/mpeg' })
    const fakeBlob = new Blob([new Uint8Array(20)], { type: 'image/jpeg' })
    const stored: StoredLocalTrack = {
      id: 'track-cached-1',
      title: 'Cached Track',
      artist: 'Cached Artist',
      albumName: 'Cached Album',
      fileName: 'cached.mp3',
      folderName: 'Music',
      path: 'Music/cached.mp3',
      durationMs: 120000,
      albumArtBlob: fakeBlob,
    }

    const info1 = buildLocalTrackInfo(stored, fakeFile)
    const info2 = buildLocalTrackInfo(stored, fakeFile)

    expect(info1.url).toBeTruthy()
    expect(info1.url).toBe(info2.url)
    expect(info1.albumArt).toBeTruthy()
    expect(info1.albumArt).toBe(info2.albumArt)
  })

  it('generates deterministic trackIds containing encoded path, size, and lastModified', async () => {
    const file = new File([new Uint8Array(256)], 'track #1.mp3', {
      type: 'audio/mpeg',
      lastModified: 1700000000000,
    })
    const itemPath = 'My Music/Artist #1/track #1.mp3'

    const result = await processAudioFiles([{ file, path: itemPath }], 'My Music', {
      concurrency: 1,
    })

    expect(result.stored).toHaveLength(1)
    const expectedId = `loc-${encodeURIComponent(itemPath)}-256-1700000000000`
    expect(result.stored[0].id).toBe(expectedId)
  })

  it('scanDirectoryHandle skips restricted folders and tolerates permission errors gracefully', async () => {
    const { scanDirectoryHandle } = await import('../local-scanner')

    const validAudioFile = new File([new Uint8Array(10)], 'song.flac', { type: 'audio/flac' })

    const mockRootHandle = {
      name: 'MusicRoot',
      kind: 'directory',
      values: async function* () {
        // 1. Valid file
        yield {
          name: 'song.flac',
          kind: 'file',
          getFile: async () => validAudioFile,
        }
        // 2. Restricted system directory
        yield {
          name: 'System Volume Information',
          kind: 'directory',
          // eslint-disable-next-line require-yield
          values: async function* () {
            throw new Error('Access denied')
          },
        }
        // 3. Restricted recycle bin
        yield {
          name: '$RECYCLE.BIN',
          kind: 'directory',
          // eslint-disable-next-line require-yield
          values: async function* () {
            throw new Error('Access denied')
          },
        }
        // 4. Broken folder throwing permission error on iteration
        yield {
          name: 'LockedFolder',
          kind: 'directory',
          // eslint-disable-next-line require-yield
          values: async function* () {
            throw new Error('Permission denied')
          },
        }
        // 5. Valid nested directory
        yield {
          name: 'SubAlbum',
          kind: 'directory',
          values: async function* () {
            yield {
              name: 'nested.mp3',
              kind: 'file',
              getFile: async () => new File([new Uint8Array(20)], 'nested.mp3', { type: 'audio/mpeg' }),
            }
          },
        }
      },
    } as unknown as FileSystemDirectoryHandle

    const onProgress = vi.fn()
    const results = await scanDirectoryHandle(mockRootHandle, onProgress)

    expect(results).toHaveLength(2)
    expect(results[0].file.name).toBe('song.flac')
    expect(results[1].file.name).toBe('nested.mp3')
    expect(onProgress).toHaveBeenCalledWith(2)
  })
})
