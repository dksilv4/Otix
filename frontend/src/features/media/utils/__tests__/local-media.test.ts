import { describe, it, expect } from 'vitest'
import { buildLocalMediaSession, buildLocalAudioTrack, isAudioFile } from '../local-media'

describe('local-media utils', () => {
  it('correctly detects audio vs video extensions', () => {
    expect(isAudioFile('song.mp3')).toBe(true)
    expect(isAudioFile('track.FLAC')).toBe(true)
    expect(isAudioFile('audio.wav')).toBe(true)
    expect(isAudioFile('clip.m4a')).toBe(true)
    expect(isAudioFile('movie.mp4')).toBe(false)
    expect(isAudioFile('video.mkv')).toBe(false)
    expect(isAudioFile('stream.webm')).toBe(false)
  })

  it('builds a direct play session for video files', () => {
    const session = buildLocalMediaSession('C:\\Users\\Test\\Videos\\Action Movie (2026).mp4')

    expect(session.source).toBe('local')
    expect(session.title).toBe('Action Movie (2026)')
    expect(session.subtitle).toBe('C:\\Users\\Test\\Videos\\Action Movie (2026).mp4')
    expect(session.container).toBe('mp4')
    expect(session.directUrl).toBe('local-media://localhost?path=C%3A%5CUsers%5CTest%5CVideos%5CAction%20Movie%20(2026).mp4')
    expect(session.selectedQuality).toBe('original')
    expect(session.videoCodec).toBe('h264')
    expect(session.audioCodec).toBe('aac')
    expect(session.playSessionId).toContain('local-session-')
  })

  it('builds a local audio track for music files with artist parsing', () => {
    const trackWithArtist = buildLocalAudioTrack('C:\\Music\\Daft Punk - Around the World.mp3')
    expect(trackWithArtist.title).toBe('Around the World')
    expect(trackWithArtist.artist).toBe('Daft Punk')
    expect(trackWithArtist.albumName).toBe('Local Music')
    expect(trackWithArtist.url).toBe('local-media://localhost?path=C%3A%5CMusic%5CDaft%20Punk%20-%20Around%20the%20World.mp3')

    const trackSimple = buildLocalAudioTrack('/home/music/solo.flac')
    expect(trackSimple.title).toBe('solo')
    expect(trackSimple.artist).toBe('Local Audio')
    expect(trackSimple.url).toBe('local-media://localhost?path=%2Fhome%2Fmusic%2Fsolo.flac')
  })
})
