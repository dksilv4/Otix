import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isChunkLoadError, reloadForNewChunk, safePrefetchChunk } from '../chunk-reload'

describe('chunk-reload', () => {
  describe('isChunkLoadError', () => {
    it('returns false for falsy values', () => {
      expect(isChunkLoadError(null)).toBe(false)
      expect(isChunkLoadError(undefined)).toBe(false)
      expect(isChunkLoadError('')).toBe(false)
    })

    it('returns false for generic errors', () => {
      expect(isChunkLoadError(new Error('Network error'))).toBe(false)
      expect(isChunkLoadError(new Error('SyntaxError: unexpected token'))).toBe(false)
      expect(isChunkLoadError({ message: '404 not found' })).toBe(false)
    })

    it('returns true for Vite/Webpack/Browser chunk load errors', () => {
      expect(
        isChunkLoadError(
          new TypeError(
            'Failed to fetch dynamically imported module: https://otix.app/assets/media-detail-page-DQF7ptJs.js',
          ),
        ),
      ).toBe(true)

      expect(
        isChunkLoadError(
          new Error('Error loading dynamically imported module'),
        ),
      ).toBe(true)

      expect(
        isChunkLoadError(
          new Error('Importing a module script failed'),
        ),
      ).toBe(true)

      expect(
        isChunkLoadError(
          new Error('Unable to preload CSS'),
        ),
      ).toBe(true)

      expect(
        isChunkLoadError(
          new Error('Loading chunk 42 failed'),
        ),
      ).toBe(true)

      expect(
        isChunkLoadError('Failed to fetch dynamically imported module'),
      ).toBe(true)
    })
  })

  describe('reloadForNewChunk', () => {
    const originalLocation = window.location

    beforeEach(() => {
      sessionStorage.clear()
      delete (window as any).location
      window.location = {
        href: 'https://otix.app/media/movie/550',
        pathname: '/media/movie/550',
        replace: vi.fn(),
      } as any
    })

    afterEach(() => {
      window.location = originalLocation
      sessionStorage.clear()
    })

    it('sets session storage and replaces location with otix_reload query parameter', () => {
      const result = reloadForNewChunk()
      expect(result).toBe(true)
      expect(sessionStorage.getItem('otix_chunk_reload_ts')).toBeTruthy()
      expect(window.location.replace).toHaveBeenCalledWith(
        expect.stringContaining('otix_reload='),
      )
    })

    it('debounces subsequent calls within 3 seconds', () => {
      const first = reloadForNewChunk()
      expect(first).toBe(true)

      const second = reloadForNewChunk()
      expect(second).toBe(false)
    })

    it('allows reload after 3 seconds have passed', () => {
      const past = Date.now() - 3500
      sessionStorage.setItem('otix_chunk_reload_ts', String(past))

      const result = reloadForNewChunk()
      expect(result).toBe(true)
    })

    it('navigates to targetPath if specified and different', () => {
      const result = reloadForNewChunk('/library')
      expect(result).toBe(true)
      expect(window.location.href).toBe('/library')
    })
  })

  describe('safePrefetchChunk', () => {
    beforeEach(() => {
      sessionStorage.clear()
      delete (window as any).location
      window.location = {
        href: 'https://otix.app/home',
        pathname: '/home',
        replace: vi.fn(),
      } as any
    })

    it('resolves silently on successful prefetch', async () => {
      const importer = vi.fn().mockResolvedValue({ default: () => null })
      expect(() => safePrefetchChunk(importer)).not.toThrow()
      expect(importer).toHaveBeenCalledTimes(1)
    })

    it('catches chunk load failure and triggers reload without throwing unhandled rejection', async () => {
      const chunkErr = new TypeError('Failed to fetch dynamically imported module: chunk.js')
      const importer = vi.fn().mockRejectedValue(chunkErr)

      safePrefetchChunk(importer)

      // Let the rejected promise flush in microtasks
      await new Promise((r) => setTimeout(r, 10))

      expect(window.location.replace).toHaveBeenCalledWith(
        expect.stringContaining('otix_reload='),
      )
    })
  })
})
