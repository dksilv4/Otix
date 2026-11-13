import { describe, it, expect } from 'vitest'
import {
  buildPlexHlsUrl,
  buildPlexDirectUrl,
  buildPlexPlaybackSession,
  switchPlexSessionServer,
  updatePlexSessionQuality,
  updatePlexSessionAudio,
  selectPlexAudioStream,
} from '../plex-stream'
import {
  formatAudioTrackLabel,
  formatAudioTrackDetails,
  getAudioBadgeLabel,
} from '../player'

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
    expect(url).not.toContain('X-Plex-Session-Identifier=')
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
    expect(switched.directUrl).not.toContain('X-Plex-Session-Identifier=')
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

  it('updates audio stream via updatePlexSessionAudio', () => {
    const initialSession = buildPlexPlaybackSession({
      baseUrl: 'http://192.168.1.100:32400',
      token: 'tok-123',
      ratingKey: '555',
      title: 'Demon Slayer',
      hlsUrl: 'http://192.168.1.100:32400/video/:/transcode/start.m3u8',
      directUrl: 'http://192.168.1.100:32400/library/parts/999/file.mkv',
      audioTracks: [
        { id: '101', index: 1, label: 'Japanese', language: 'ja', codec: 'aac', channels: 2, isDefault: true },
        { id: '102', index: 2, label: 'English', language: 'en', codec: 'eac3', channels: 6, isDefault: false },
      ],
    })

    const updated = updatePlexSessionAudio(initialSession, {
      id: '102',
      index: 2,
      label: 'English',
      language: 'en',
      codec: 'eac3',
      channels: 6,
    })

    expect(updated.selectedAudioIndex).toBe(2)
    expect(updated.hlsUrl).toContain('audioStreamID=102')
    expect(updated.playbackMethod).toBe('direct-stream')
  })

  it('appends offset and copyts=1 to HLS URL when offsetSeconds is specified', () => {
    const url = buildPlexHlsUrl(
      'http://192.168.1.100:32400',
      '12345',
      'token-abc',
      'session-1',
      'client-xyz',
      { offsetSeconds: 154.8 },
    )
    expect(url).toContain('&offset=154&copyts=1')
  })

  it('does not append offset or copyts when offsetSeconds is 0 or undefined', () => {
    const url = buildPlexHlsUrl(
      'http://192.168.1.100:32400',
      '12345',
      'token-abc',
      'session-1',
      'client-xyz',
    )
    expect(url).not.toContain('&offset=')
    expect(url).not.toContain('&copyts=1')
  })

  it('varies playSessionId by audioTrack.id and preserves offset during updatePlexSessionAudio', () => {
    const initialSession = buildPlexPlaybackSession({
      baseUrl: 'http://192.168.1.100:32400',
      token: 'tok-123',
      ratingKey: '555',
      title: 'Interstellar',
      hlsUrl: 'http://192.168.1.100:32400/video/:/transcode/start.m3u8',
      audioTracks: [
        { id: '101', index: 1, label: 'English', language: 'en', codec: 'aac', channels: 6, isDefault: true },
        { id: '102', index: 2, label: 'French', language: 'fr', codec: 'ac3', channels: 6, isDefault: false },
      ],
    })

    const updated = updatePlexSessionAudio(
      initialSession,
      { id: '102', index: 2, label: 'French', language: 'fr', codec: 'ac3', channels: 6 },
      120.5,
    )

    expect(updated.playSessionId).toContain('-a-102')
    expect(updated.selectedAudioIndex).toBe(2)
    expect(updated.hlsUrl).toContain('audioStreamID=102')
    expect(updated.hlsUrl).toContain('&offset=120&copyts=1')
    expect(updated.hlsUrl).toContain(`session=${encodeURIComponent(updated.playSessionId)}`)
    expect(updated.startPositionMs).toBe(120500)
  })

  it('formats audio track labels and details correctly', () => {
    expect(formatAudioTrackLabel({ label: 'Japanese', language: 'ja', index: 1 })).toBe('Japanese')
    expect(formatAudioTrackLabel({ label: 'Audio', language: 'ja', index: 1 })).toBe('JA')
    expect(formatAudioTrackLabel({ label: 'Audio', language: 'und', index: 2 })).toBe('Track 2')

    expect(formatAudioTrackDetails({ codec: 'eac3', channels: 6 })).toBe('EAC3 · 5.1')
    expect(formatAudioTrackDetails({ codec: 'aac', channels: 2 })).toBe('AAC · 2ch')

    expect(getAudioBadgeLabel({ label: 'Japanese', language: 'ja', index: 1 })).toBe('JA')
    expect(getAudioBadgeLabel(null, [{ label: 'English', language: 'en', index: 1 }])).toBe('EN')
  })
})
