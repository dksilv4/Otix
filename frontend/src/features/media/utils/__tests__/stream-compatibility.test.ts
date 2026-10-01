import { describe, it, expect } from 'vitest'
import { determinePlaybackMethod, normalizeFormat } from '../stream-compatibility'

describe('stream-compatibility', () => {
  it('normalizes format strings', () => {
    expect(normalizeFormat('H.264')).toBe('h264')
    expect(normalizeFormat('E-AC-3')).toBe('eac3')
    expect(normalizeFormat(null)).toBe('')
  })

  it('allows direct-play for native mp4 with h264 and aac', () => {
    expect(determinePlaybackMethod('mp4', 'h264', 'aac')).toBe('direct-play')
    expect(determinePlaybackMethod('webm', 'vp9', 'opus')).toBe('direct-play')
    expect(determinePlaybackMethod('mp4', 'av1', 'mp3')).toBe('direct-play')
  })

  it('routes to direct-stream (remux) when container is MKV but codecs are native', () => {
    expect(determinePlaybackMethod('mkv', 'h264', 'aac')).toBe('direct-stream')
    expect(determinePlaybackMethod('matroska', 'av1', 'opus')).toBe('direct-stream')
  })

  it('routes to direct-stream when audio is AC3/DTS and video is native to avoid silent video', () => {
    expect(determinePlaybackMethod('mp4', 'h264', 'ac3')).toBe('direct-stream')
    expect(determinePlaybackMethod('mkv', 'h264', 'dts')).toBe('direct-stream')
    expect(determinePlaybackMethod('mp4', 'h264', 'eac3')).toBe('direct-stream')
    expect(determinePlaybackMethod('mkv', 'h264', 'truehd')).toBe('direct-stream')
  })

  it('routes to full transcode when video codec is non-native', () => {
    expect(determinePlaybackMethod('mkv', 'hevc', 'aac')).toBe('transcode')
    expect(determinePlaybackMethod('mp4', 'mpeg2video', 'mp3')).toBe('transcode')
    expect(determinePlaybackMethod('mkv', 'vc1', 'dts')).toBe('transcode')
  })
})
