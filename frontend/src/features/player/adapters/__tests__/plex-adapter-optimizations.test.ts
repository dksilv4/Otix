import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlexSourceAdapter } from '../plex-adapter'
import { apiClient } from '@/lib/api/client'
import type { PlayableMediaItem } from '../../types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: null }),
  },
}))

describe('PlexSourceAdapter Advanced Optimizations', () => {
  let adapter: PlexSourceAdapter

  beforeEach(() => {
    adapter = new PlexSourceAdapter()
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  describe('Direct Play vs Transcode Decision Tree', () => {
    it('selects direct-play when video container & codecs are compatible and no burn-in needed', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:101',
        source: 'plex',
        mediaType: 'video',
        title: 'Direct Movie',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'token123',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
          partKey: '/library/parts/101/file.mp4',
          subtitles: [
            {
              id: 'sub-srt',
              index: 0,
              label: 'English',
              language: 'eng',
              format: 'vtt',
              isExternal: true,
              requiresBurnIn: false,
            },
          ],
          selectedSubtitleIndex: 0,
        },
      }

      const res = await adapter.resolvePlayback(item)
      expect(res.playbackMethod).toBe('direct-play')
      expect(res.engine).toBe('html5-video')
      expect(res.directUrl).toBeDefined()
    })

    it('forces transcode when subtitle requires burn-in (e.g. PGS / VOBSUB)', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:102',
        source: 'plex',
        mediaType: 'video',
        title: 'Burn-in Anime',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'token123',
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
          partKey: '/library/parts/102/file.mp4',
          subtitles: [
            {
              id: 'sub-pgs',
              index: 2,
              label: 'Japanese PGS',
              language: 'jpn',
              format: 'pgs',
              isExternal: false,
              requiresBurnIn: true,
            },
          ],
          selectedSubtitleIndex: 2,
        },
      }

      const res = await adapter.resolvePlayback(item)
      expect(res.playbackMethod).toBe('transcode')
      expect(res.engine).toBe('hls')
      expect(res.hlsUrl).toContain('/video/:/transcode/universal/start.m3u8')
    })
  })

  describe('PMS Timeline Scrobbling & Shared Server Protection', () => {
    it('reports progress directly to PMS timeline and Otix backend on owned server', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:201',
        source: 'plex',
        mediaType: 'video',
        title: 'Watched Movie',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'owned-token',
          isSharedServer: false,
        },
      }

      await adapter.reportProgress({
        item,
        positionSeconds: 120,
        durationSeconds: 7200,
        state: 'playing',
        sessionId: 'sess-abc',
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/:/timeline?ratingKey=201&key=%2Flibrary%2Fmetadata%2F201&state=playing'),
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('skips direct PMS timeline call on shared servers to prevent watch offset pollution', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:202',
        source: 'plex',
        mediaType: 'video',
        title: 'Friend Movie',
        providerData: {
          serverUrl: 'https://friend-server.plex.direct:32400',
          token: 'friend-token',
          isSharedServer: true,
        },
      }

      await adapter.reportProgress({
        item,
        positionSeconds: 300,
        durationSeconds: 5000,
        state: 'playing',
        sessionId: 'sess-xyz',
      })

      // Direct PMS timeline call must NOT be made
      expect(global.fetch).not.toHaveBeenCalled()

      // But local Otix backend must be updated with localOnly = true
      expect(apiClient.post).toHaveBeenCalledWith(
        '/integrations/plex/timeline',
        expect.objectContaining({
          localOnly: true,
          ratingKey: '202',
          state: 'playing',
        }),
      )
    })
  })

  describe('Quality Adjustment and Multi-Server Failover', () => {
    it('applies maxVideoBitrate and videoResolution on quality change', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:301',
        source: 'plex',
        mediaType: 'video',
        title: 'Quality Movie',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'token123',
        },
      }

      const qualityOption = {
        id: '720p-4mbps',
        label: '720p (4 Mbps)',
        maxVideoBitrate: 4000,
        videoResolution: '1280x720',
      }

      const res = await adapter.changeQuality(item, qualityOption, 45)
      expect(res.hlsUrl).toContain('maxVideoBitrate=4000')
      expect(res.hlsUrl).toContain('videoResolution=1280x720')
    })

    it('switches server during failover without losing ratingKey', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:401',
        source: 'plex',
        mediaType: 'video',
        title: 'Failover Test',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          baseUrls: ['http://192.168.1.50:32400', 'https://remote.plex.direct:32400'],
        },
      }

      const failoverUrl = await adapter.failoverServer('http://192.168.1.50:32400', item)
      expect(failoverUrl).toBe('https://remote.plex.direct:32400')
      expect(item.providerData?.serverUrl).toBe('https://remote.plex.direct:32400')
    })
  })

  describe('Binge-Watching / Next Episode Resolution', () => {
    it('constructs next episode with incremented episodeNumber', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:9001',
        source: 'plex',
        mediaType: 'video',
        subtype: 'episode',
        title: 'Awesome Show',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'tok',
        },
        episodeContext: {
          seriesTitle: 'Awesome Show',
          seasonNumber: 2,
          episodeNumber: 4,
          episodeTitle: 'The Reveal',
          nextItemId: '9002',
        },
      }

      const next = await adapter.getNextItem(item)
      expect(next).not.toBeNull()
      expect(next?.id).toBe('plex:9002')
      expect(next?.episodeContext?.seasonNumber).toBe(2)
      expect(next?.episodeContext?.episodeNumber).toBe(5)
      expect(next?.episodeContext?.prevItemId).toBe('9001')
    })
  })

  describe('Audio Track Switching and Offset Forwarding', () => {
    it('varies playSessionId and appends offsetSeconds on changeTracks', async () => {
      const item: PlayableMediaItem = {
        id: 'plex:501',
        source: 'plex',
        mediaType: 'video',
        title: 'Track Change Movie',
        providerData: {
          serverUrl: 'http://192.168.1.50:32400',
          token: 'tok',
          playSessionId: 'sess-base-123',
          audioTracks: [
            { id: '10', index: 0, label: 'English', isDefault: true },
            { id: '11', index: 1, label: 'Spanish', isDefault: false },
          ],
        },
      }

      const res = await adapter.changeTracks(item, 1, undefined, 245)
      expect(res.hlsUrl).toContain('&offset=245&copyts=1')
      expect(res.hlsUrl).toContain('-a-11')
      expect(item.providerData?.playSessionId).toContain('-a-11')
      expect(item.providerData?.startPositionMs).toBe(245000)
    })
  })
})
