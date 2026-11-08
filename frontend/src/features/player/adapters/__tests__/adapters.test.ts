import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adapterRegistry } from '../registry'
import { PlexSourceAdapter } from '../plex-adapter'
import { JellyfinSourceAdapter } from '../jellyfin-adapter'
import { LocalSourceAdapter } from '../local-adapter'
import { YouTubeSourceAdapter } from '../youtube-adapter'
import { DirectSourceAdapter } from '../direct-adapter'
import type { PlayableMediaItem } from '../../types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: null }),
  },
}))

describe('Media Source Adapters', () => {
  beforeEach(() => {
    adapterRegistry.clear()
    adapterRegistry.register(new PlexSourceAdapter())
    adapterRegistry.register(new JellyfinSourceAdapter())
    adapterRegistry.register(new LocalSourceAdapter())
    adapterRegistry.register(new YouTubeSourceAdapter())
    adapterRegistry.register(new DirectSourceAdapter())
  })

  describe('AdapterRegistry', () => {
    it('resolves the correct adapter for each source', () => {
      const plexItem: PlayableMediaItem = { id: '1', source: 'plex', mediaType: 'video', title: 'Movie' }
      const jfItem: PlayableMediaItem = { id: '2', source: 'jellyfin', mediaType: 'audio', title: 'Song' }
      const localItem: PlayableMediaItem = { id: '3', source: 'local', mediaType: 'audio', title: 'Local' }
      const ytItem: PlayableMediaItem = { id: '4', source: 'youtube', mediaType: 'video', title: 'Trailer' }
      const directItem: PlayableMediaItem = { id: '5', source: 'direct', mediaType: 'video', title: 'Direct' }

      expect(adapterRegistry.resolve(plexItem).id).toBe('plex')
      expect(adapterRegistry.resolve(jfItem).id).toBe('jellyfin')
      expect(adapterRegistry.resolve(localItem).id).toBe('local')
      expect(adapterRegistry.resolve(ytItem).id).toBe('youtube')
      expect(adapterRegistry.resolve(directItem).id).toBe('direct')
    })

    it('falls back to direct adapter for external HTTP URLs', () => {
      const httpItem: PlayableMediaItem = {
        id: 'https://example.com/video.mp4',
        source: 'unknown',
        mediaType: 'video',
        title: 'Unknown',
      }
      expect(adapterRegistry.resolve(httpItem).id).toBe('direct')
    })
  })

  describe('PlexSourceAdapter', () => {
    const plexAdapter = new PlexSourceAdapter()

    it('resolves audio playback to html5-audio', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:123',
        source: 'plex',
        mediaType: 'audio',
        title: 'Track Title',
        providerData: {
          serverUrl: 'http://192.168.1.100:32400',
          token: 'plex-secret-token',
          partKey: '/library/parts/999/file.mp3',
        },
      }

      const res = await plexAdapter.resolvePlayback(item)
      expect(res.engine).toBe('html5-audio')
      expect(res.streamUrl).toContain('192.168.1.100:32400')
      expect(res.streamUrl).toContain('X-Plex-Token=plex-secret-token')
    })

    it('resolves compatible video with no burn-in to direct-play', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:456',
        source: 'plex',
        mediaType: 'video',
        title: 'Test Movie',
        providerData: {
          serverUrl: 'http://192.168.1.100:32400',
          token: 'plex-token',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
          partKey: '/library/parts/456/file.mp4',
        },
      }

      const res = await plexAdapter.resolvePlayback(item)
      expect(res.playbackMethod).toBe('direct-play')
      expect(res.engine).toBe('html5-video')
      expect(res.directUrl).toBeDefined()
    })

    it('forces transcode (HLS) when subtitle requires burn-in', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:789',
        source: 'plex',
        mediaType: 'video',
        title: 'Subbed Anime',
        providerData: {
          serverUrl: 'http://192.168.1.100:32400',
          token: 'plex-token',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
          partKey: '/library/parts/789/file.mp4',
          subtitles: [
            {
              id: 'sub-1',
              index: 1,
              label: 'English PGS',
              language: 'eng',
              format: 'pgs',
              isExternal: false,
              requiresBurnIn: true,
            },
          ],
          selectedSubtitleIndex: 1,
        },
      }

      const res = await plexAdapter.resolvePlayback(item)
      expect(res.playbackMethod).toBe('transcode')
      expect(res.engine).toBe('hls')
      expect(res.hlsUrl).toContain('/video/:/transcode/universal/start.m3u8')
    })

    it('switches server during failover', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:100',
        source: 'plex',
        mediaType: 'video',
        title: 'Failover Movie',
        providerData: {
          serverUrl: 'http://192.168.1.100:32400',
          baseUrls: ['http://192.168.1.100:32400', 'https://10-0-0-1.plex.direct:32400'],
        },
      }

      const nextUrl = await plexAdapter.failoverServer('http://192.168.1.100:32400', item)
      expect(nextUrl).toBe('https://10-0-0-1.plex.direct:32400')
      expect(item.providerData?.serverUrl).toBe('https://10-0-0-1.plex.direct:32400')
    })

    it('resolves next episode for binge watching', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:501',
        source: 'plex',
        mediaType: 'video',
        subtype: 'episode',
        title: 'TV Series',
        episodeContext: {
          seriesTitle: 'TV Series',
          seasonNumber: 1,
          episodeNumber: 1,
          episodeTitle: 'Pilot',
          nextItemId: '502',
        },
      }

      const next = await plexAdapter.getNextItem(item)
      expect(next).not.toBeNull()
      expect(next?.id).toBe('plex:502')
      expect(next?.episodeContext?.episodeNumber).toBe(2)
    })
  })

  describe('YouTubeSourceAdapter', () => {
    const ytAdapter = new YouTubeSourceAdapter()

    it('extracts youtube ID and formats embed URL without app:// origin', async () => {
      const item: PlayableMediaItem = {
        id: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        source: 'youtube',
        mediaType: 'video',
        title: 'Rick Astley',
      }

      const res = await ytAdapter.resolvePlayback(item)
      expect(res.engine).toBe('youtube')
      expect(res.embedUrl).toContain('dQw4w9WgXcQ')
      expect(res.embedUrl).toContain('enablejsapi=1')
    })
  })
})
