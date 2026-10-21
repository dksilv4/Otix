import { describe, it, expect } from 'vitest'
import {
  buildPlexHlsUrl,
  buildPlexDirectUrl,
  buildPlexPlaybackSession,
  switchPlexSessionServer,
  updatePlexSessionQuality,
} from '../plex-stream'

describe('plex-stream utilities', () => {
  it('builds HLS URL with correct Plex client parameters', () => {
    const url = buildPlexHlsUrl('http://192.168.1.100:32400', '12345', 'token-abc', 'session-1', 'client-xyz')
    expect(url).toContain('http://192.168.1.100:32400/video/:/transcode/universal/start.m3u8')
    expect(url).toContain('path=%2Flibrary%2Fmetadata%2F12345')
    expect(url).toContain('session=session-1')
    expect(url).toContain('X-Plex-Session-Identifier=session-1')
    expect(url).toContain('X-Plex-Playback-Session-Id=session-1')
    expect(url).toContain('X-Plex-Client-Identifier=client-xyz')
    expect(url).toContain('X-Plex-Token=token-abc')
    expect(url).toContain('protocol=hls')
  })

  it('builds direct URL for media parts', () => {
    const url = buildPlexDirectUrl('http://192.168.1.100:32400', '/library/parts/999/file.mp4', 'token-abc', 'session-1', 'client-xyz')
    expect(url).toContain('http://192.168.1.100:32400/library/parts/999/file.mp4?')
    expect(url).toContain('X-Plex-Token=token-abc')
    expect(url).toContain('X-Plex-Session-Identifier=session-1')
    expect(url).toContain('X-Plex-Client-Identifier=client-xyz')
  })

  it('builds StreamPlaybackSession from pre-resolved connect-info payload', () => {
    const session = buildPlexPlaybackSession({
      baseUrl: 'http://192.168.1.100:32400',
      token: 'tok-123',
      ratingKey: '555',
      title: 'Inception',
      directUrl: 'http://192.168.1.100:32400/library/parts/1/file.mp4?X-Plex-Token=tok-123',
      hlsUrl: 'http://192.168.1.100:32400/video/:/transcode/start.m3u8',
      baseUrls: ['http://192.168.1.100:32400', 'https://remote.plex.direct:32400'],
      audioTracks: [
        { id: '1', index: 1, label: 'English (EAC3 5.1)', language: 'eng', codec: 'eac3', channels: 6 },
      ],
      subtitles: [
        { id: '2', index: 2, label: 'English (SRT)', language: 'eng', format: 'srt', isExternal: true, requiresBurnIn: false },
      ],
      viewOffset: 45000,
      duration: 8400000,
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'eac3',
    })

    expect(session.source).toBe('plex')
    expect(session.serverUrl).toBe('http://192.168.1.100:32400')
    expect(session.itemId).toBe('555')
    expect(session.title).toBe('Inception')
    expect(session.startPositionMs).toBe(45000)
    expect(session.durationMs).toBe(8400000)
    expect(session.audioTracks).toHaveLength(1)
    expect(session.subtitles).toHaveLength(1)
    expect(session.baseUrls).toEqual(['http://192.168.1.100:32400', 'https://remote.plex.direct:32400'])
  })

  it('supports failover switching to alternative Plex server base URL', () => {
    const original = buildPlexPlaybackSession({
      baseUrl: 'http://192.168.1.100:32400',
      token: 'tok-123',
      ratingKey: '555',
      title: 'Inception',
      directUrl: 'http://192.168.1.100:32400/library/parts/1/file.mp4?X-Plex-Token=tok-123',
      baseUrls: ['http://192.168.1.100:32400', 'https://remote.plex.direct:32400'],
      subtitles: [
        {
          id: '2',
          index: 2,
          label: 'English',
          language: 'eng',
          url: 'http://192.168.1.100:32400/sub.vtt',
          format: 'vtt',
          isExternal: true,
          requiresBurnIn: false,
        },
      ],
    })

    const switched = switchPlexSessionServer(original, 'https://remote.plex.direct:32400')
    expect(switched.serverUrl).toBe('https://remote.plex.direct:32400')
    expect(switched.directUrl).toContain('https://remote.plex.direct:32400/library/parts/1/file.mp4?')
    expect(switched.directUrl).toContain('X-Plex-Token=tok-123')
    expect(switched.directUrl).toContain('X-Plex-Session-Identifier=')
    expect(switched.hlsUrl).toContain('https://remote.plex.direct:32400/video/:/transcode')
    expect(switched.subtitles[0].url).toBe('https://remote.plex.direct:32400/sub.vtt')
  })

  it('builds HLS URL with custom bitrate and resolution quality options', () => {
    const url = buildPlexHlsUrl(
      'http://192.168.1.100:32400',
      '12345',
      'token-abc',
      'session-1',
      'client-xyz',
      { maxVideoBitrate: 4000, videoResolution: '1280x720' },
    )
    expect(url).toContain('maxVideoBitrate=4000')
    expect(url).toContain('videoResolution=1280x720')
  })

  it('updates session quality via updatePlexSessionQuality', () => {
    const initialSession = buildPlexPlaybackSession({
      baseUrl: 'http://192.168.1.100:32400',
      token: 'tok-123',
      ratingKey: '555',
      title: 'Inception',
      hlsUrl: 'http://192.168.1.100:32400/video/:/transcode/start.m3u8',
    })

    const updated = updatePlexSessionQuality(initialSession, {
      id: '720p',
      label: '720p HD',
      height: 720,
      maxVideoBitrate: 4000,
      videoResolution: '1280x720',
    })

    expect(updated.selectedQuality).toBe('720p')
    expect(updated.maxVideoBitrate).toBe(4000)
    expect(updated.videoResolution).toBe('1280x720')
    expect(updated.hlsUrl).toContain('maxVideoBitrate=4000')
    expect(updated.hlsUrl).toContain('videoResolution=1280x720')
  })
})
