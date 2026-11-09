import { describe, it, expect, vi } from 'vitest'
import { extractFilesFromDataTransfer } from '../drop-extractor'

describe('drop-extractor', () => {
  it('returns empty array when dataTransfer has no files or items', async () => {
    const mockDataTransfer = {
      items: [],
      files: [],
    } as unknown as DataTransfer

    const results = await extractFilesFromDataTransfer(mockDataTransfer)
    expect(results).toEqual([])
  })

  it('falls back to dataTransfer.files when webkitGetAsEntry is not available', async () => {
    const file1 = new File(['dummy-content'], 'track1.mp3', { type: 'audio/mpeg' })
    const file2 = new File(['dummy-content'], 'track2.flac', { type: 'audio/flac' })

    const mockDataTransfer = {
      items: [],
      files: [file1, file2],
    } as unknown as DataTransfer

    const results = await extractFilesFromDataTransfer(mockDataTransfer)
    expect(results).toHaveLength(2)
    expect(results[0].file).toBe(file1)
    expect(results[0].path).toBe('track1.mp3')
    expect(results[1].file).toBe(file2)
    expect(results[1].path).toBe('track2.flac')
  })

  it('traverses nested directory entries recursively using webkitGetAsEntry', async () => {
    const songFile1 = new File(['mp3-data'], '01_intro.mp3', { type: 'audio/mpeg' })
    const songFile2 = new File(['flac-data'], '02_climax.flac', { type: 'audio/flac' })

    const fileEntry1 = {
      isFile: true,
      isDirectory: false,
      name: '01_intro.mp3',
      file: (cb: (f: File) => void) => cb(songFile1),
    }

    const fileEntry2 = {
      isFile: true,
      isDirectory: false,
      name: '02_climax.flac',
      file: (cb: (f: File) => void) => cb(songFile2),
    }

    let subDirReadCount = 0
    const subDirReader = {
      readEntries: (success: (entries: any[]) => void) => {
        if (subDirReadCount === 0) {
          subDirReadCount++
          success([fileEntry2])
        } else {
          success([]) // empty indicates finished
        }
      },
    }

    const subDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'CD2',
      createReader: () => subDirReader,
    }

    let rootDirReadCount = 0
    const rootDirReader = {
      readEntries: (success: (entries: any[]) => void) => {
        if (rootDirReadCount === 0) {
          rootDirReadCount++
          success([fileEntry1, subDirEntry])
        } else {
          success([])
        }
      },
    }

    const rootDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'PinkFloyd',
      createReader: () => rootDirReader,
    }

    const mockItem = {
      webkitGetAsEntry: vi.fn().mockReturnValue(rootDirEntry),
    }

    const mockDataTransfer = {
      items: [mockItem],
      files: [],
    } as unknown as DataTransfer

    const results = await extractFilesFromDataTransfer(mockDataTransfer)

    expect(results).toHaveLength(2)
    expect(results[0].file).toBe(songFile1)
    expect(results[0].path).toBe('PinkFloyd/01_intro.mp3')
    expect(results[0].folderName).toBe('PinkFloyd')

    expect(results[1].file).toBe(songFile2)
    expect(results[1].path).toBe('PinkFloyd/CD2/02_climax.flac')
    expect(results[1].folderName).toBe('PinkFloyd')
  })
})
