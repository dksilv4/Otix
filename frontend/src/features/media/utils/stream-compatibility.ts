import type { PlaybackMethod } from '../types/stream-player'

/**
 * Native web-compatible containers and codecs supported by standard HTML5 <video>
 * without proprietary Dolby/DTS license restrictions.
 */
const NATIVE_CONTAINERS = new Set(['mp4', 'm4v', 'webm', 'mov'])
const NATIVE_VIDEO_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1', 'av01'])
const NATIVE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

// Formats that cause silent playback or decoder failures in standard Chromium/Safari
const PROPRIETARY_AUDIO_CODECS = new Set(['ac3', 'eac3', 'dts', 'dca', 'truehd', 'mlp'])

export function normalizeFormat(str?: string | null): string {
  if (!str) return ''
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Determines whether a stream can be direct-played, direct-streamed (remuxed),
 * or must be fully transcoded by the media server.
 */
export function determinePlaybackMethod(
  container?: string | null,
  videoCodec?: string | null,
  audioCodec?: string | null,
): PlaybackMethod {
  const c = normalizeFormat(container)
  const v = normalizeFormat(videoCodec)
  const a = normalizeFormat(audioCodec)

  // 1. If audio is AC-3, E-AC-3, DTS, or TrueHD, browser <video> will play video in silence.
  // We must transcode/remux the audio to AAC/Opus via server.
  if (PROPRIETARY_AUDIO_CODECS.has(a)) {
    // If video is natively supported, server can direct-stream video & transcode audio
    if (!v || NATIVE_VIDEO_CODECS.has(v)) {
      return 'direct-stream'
    }
    return 'transcode'
  }

  // 2. Check if video codec is non-native (e.g. HEVC/H.265 without OS extensions, MPEG2, VC-1)
  if (v && !NATIVE_VIDEO_CODECS.has(v)) {
    return 'transcode'
  }

  // 3. Check container
  // If container is MKV or TS, standard <video> cannot reliably direct play range requests.
  if (c && !NATIVE_CONTAINERS.has(c)) {
    return 'direct-stream'
  }

  // 4. Check if audio is non-native
  if (a && !NATIVE_AUDIO_CODECS.has(a)) {
    return 'direct-stream'
  }

  return 'direct-play'
}
