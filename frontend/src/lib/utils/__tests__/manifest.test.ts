import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MANIFEST_CHUNK_SIZE,
  toManifestFiles,
  uploadNodeManifestInChunks,
  uploadScannedGamesManifest,
} from '../manifest'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('manifest utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.post).mockResolvedValue({ data: { status: 'ok' } } as any)
  })

  describe('toManifestFiles', () => {
    it('maps scanned game items to manifest file entries with relative paths and format categories', () => {
      const scanned = [
        {
          title: 'Hollow Knight',
          exePath: 'C:\\Games\\Hollow Knight\\hollow_knight.exe',
          installDir: 'C:\\Games\\Hollow Knight',
          platform: 'pc',
          otixMediaId: '1001',
          otixMediaTitle: 'Hollow Knight',
          otixConfidence: 0.99,
        },
        {
          title: 'Final Fantasy VII',
          exePath: 'D:/ISOs/FFVII.iso',
          platform: 'iso',
        },
      ]

      const result = toManifestFiles(scanned)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        filename: 'Hollow Knight',
        filepath: 'C:\\Games\\Hollow Knight\\hollow_knight.exe',
        relative_path: 'Games\\Hollow Knight',
        game_title: 'Hollow Knight',
        format_category: 'game',
        otix_media_id: '1001',
        otix_title: 'Hollow Knight',
        otix_confidence: 0.99,
      })
      expect(result[1]).toEqual({
        filename: 'Final Fantasy VII',
        filepath: 'D:/ISOs/FFVII.iso',
        relative_path: 'Final Fantasy VII',
        game_title: 'Final Fantasy VII',
        format_category: 'iso',
        otix_media_id: undefined,
        otix_title: undefined,
        otix_confidence: undefined,
      })
    })

    it('returns empty array when input is not an array', () => {
      expect(toManifestFiles(null as any)).toEqual([])
      expect(toManifestFiles(undefined as any)).toEqual([])
      expect(toManifestFiles([] as any)).toEqual([])
    })
  })

  describe('uploadNodeManifestInChunks', () => {
    it('does nothing when files array is empty', async () => {
      await uploadNodeManifestInChunks(0, [])
      expect(apiClient.post).not.toHaveBeenCalled()
    })

    it('posts single request without append flag when items <= chunkSize', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({ filename: `Game ${i}` }))
      await uploadNodeManifestInChunks(0, items)

      expect(apiClient.post).toHaveBeenCalledTimes(1)
      expect(apiClient.post).toHaveBeenCalledWith('/library/nodes/0/manifest', {
        files: items,
      })
    })

    it('chunks 1,200 items into 3 requests of 500, 500, and 200 with append flag on subsequent chunks', async () => {
      const items = Array.from({ length: 1200 }, (_, i) => ({ filename: `Game ${i}` }))
      const progressSpy = vi.fn()

      await uploadNodeManifestInChunks(42, items, { chunkSize: 500, onProgress: progressSpy })

      expect(apiClient.post).toHaveBeenCalledTimes(3)
      // First chunk: 500 items, no append flag
      expect(apiClient.post).toHaveBeenNthCalledWith(1, '/library/nodes/42/manifest', {
        files: items.slice(0, 500),
      })
      // Second chunk: 500 items, append = true
      expect(apiClient.post).toHaveBeenNthCalledWith(2, '/library/nodes/42/manifest', {
        files: items.slice(500, 1000),
        append: true,
      })
      // Third chunk: 200 items, append = true
      expect(apiClient.post).toHaveBeenNthCalledWith(3, '/library/nodes/42/manifest', {
        files: items.slice(1000, 1200),
        append: true,
      })

      expect(progressSpy).toHaveBeenCalledTimes(3)
      expect(progressSpy).toHaveBeenNthCalledWith(1, 500, 1200)
      expect(progressSpy).toHaveBeenNthCalledWith(2, 1000, 1200)
      expect(progressSpy).toHaveBeenNthCalledWith(3, 1200, 1200)
    })
  })

  describe('uploadScannedGamesManifest', () => {
    it('converts scanned games and uploads them in chunks', async () => {
      const scanned = Array.from({ length: 25 }, (_, i) => ({
        title: `Game ${i}`,
        installDir: `C:\\Games\\G${i}`,
      }))

      await uploadScannedGamesManifest(0, scanned, { chunkSize: 10 })

      expect(apiClient.post).toHaveBeenCalledTimes(3)
      expect(apiClient.post).toHaveBeenNthCalledWith(1, '/library/nodes/0/manifest', {
        files: expect.arrayContaining([
          expect.objectContaining({ game_title: 'Game 0' }),
        ]),
      })
      expect(apiClient.post).toHaveBeenNthCalledWith(2, '/library/nodes/0/manifest', {
        files: expect.arrayContaining([
          expect.objectContaining({ game_title: 'Game 10' }),
        ]),
        append: true,
      })
    })
  })
})
