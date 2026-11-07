import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { useState } from 'react'
import { render, renderHook, act, screen, fireEvent } from '@testing-library/react'
import { parseAudioFileMetadata } from '../local/utils/id3-parser'
import { MusicTrackRow } from '../components/molecules/music-track-row'
import { PlexAudioProvider } from '@/lib/player/plex-audio-provider'
import { usePlexPlayer } from '@/lib/player/hooks/use-plex-player'
import type { PlexTrackInfo } from '@/lib/player/types'

// ---------------------------------------------------------------------------
// Binary Buffer Generators for FLAC and MP3 Headers
// ---------------------------------------------------------------------------

/**
 * Builds a valid 42-byte binary FLAC buffer containing a STREAMINFO metadata block.
 * - sampleRate: 44,100 Hz (0x0AC44)
 * - totalSamples: 8,820,000 (0x008694C0) -> 200,000 ms duration
 */
const createValidFlacBuffer = (sampleRate = 44100, totalSamples = 8820000): ArrayBuffer => {
  const buffer = new Uint8Array(42)
  // 'fLaC' stream marker
  buffer[0] = 0x66
  buffer[1] = 0x4c
  buffer[2] = 0x61
  buffer[3] = 0x43

  // METADATA_BLOCK_HEADER: isLast = 0, blockType = 0 (STREAMINFO), length = 34
  buffer[4] = 0x00
  buffer[5] = 0x00
  buffer[6] = 0x00
  buffer[7] = 0x22

  // STREAMINFO payload (34 bytes at offset 8):
  // Bytes 10-12 of STREAMINFO (offsets 18-20 in buffer): sample_rate (20 bits)
  const sr20 = sampleRate & 0xfffff
  buffer[18] = (sr20 >> 12) & 0xff
  buffer[19] = (sr20 >> 4) & 0xff
  buffer[20] = ((sr20 & 0x0f) << 4) | 0x02 // sample_rate low 4 bits + 2 channels

  // Bytes 13-17 of STREAMINFO (offsets 21-25 in buffer): total_samples (36 bits)
  const totalSamplesUpper = Math.floor(totalSamples / 0x100000000) & 0x0f
  const totalSamplesLower = totalSamples >>> 0
  buffer[21] = 0xf0 | totalSamplesUpper // 16 bits per sample + upper 4 bits
  buffer[22] = (totalSamplesLower >> 24) & 0xff
  buffer[23] = (totalSamplesLower >> 16) & 0xff
  buffer[24] = (totalSamplesLower >> 8) & 0xff
  buffer[25] = totalSamplesLower & 0xff

  return buffer.buffer as ArrayBuffer
}

/**
 * Builds a valid MP3 buffer with an MPEG-1 Layer 3 frame and Xing VBR header.
 * - sampleRate: 44,100 Hz (freqIdx = 0)
 * - samplesPerFrame: 1152
 * - totalFrames: 7,656 -> totalSamples: 8,819,712 -> ~199,993 ms duration
 */
const createValidMp3XingBuffer = (totalFrames = 7656): ArrayBuffer => {
  const buffer = new Uint8Array(128)
  // MPEG Audio Frame Header (4 bytes):
  // 0xFF, 0xFB -> Sync 11 bits (0x7FF), MPEG-1 (ver 3), Layer 3 (layer 1), No CRC
  buffer[0] = 0xff
  buffer[1] = 0xfb
  // Bitrate 128kbps (idx 9), 44100Hz (idx 0), no padding
  buffer[2] = 0x90
  // Stereo (channelMode 0)
  buffer[3] = 0x00

  // For MPEG-1 stereo (channelMode !== 3), Xing offset is 4 + 32 = 36
  const xingOffset = 36
  // 'Xing' marker
  buffer[xingOffset] = 0x58
  buffer[xingOffset + 1] = 0x69
  buffer[xingOffset + 2] = 0x6e
  buffer[xingOffset + 3] = 0x67

  // Flags: 0x00000001 (Frames field present)
  buffer[xingOffset + 7] = 0x01

  // totalFrames (4 bytes big-endian)
  buffer[xingOffset + 8] = (totalFrames >> 24) & 0xff
  buffer[xingOffset + 9] = (totalFrames >> 16) & 0xff
  buffer[xingOffset + 10] = (totalFrames >> 8) & 0xff
  buffer[xingOffset + 11] = totalFrames & 0xff

  return buffer.buffer as ArrayBuffer
}

/**
 * Builds a valid MP3 buffer with an ID3v2.3 TLEN frame (Length in milliseconds).
 */
const createValidMp3TlenBuffer = (durationMs = 195000): ArrayBuffer => {
  const buffer = new Uint8Array(64)
  // ID3 header
  buffer[0] = 0x49 // 'I'
  buffer[1] = 0x44 // 'D'
  buffer[2] = 0x33 // '3'
  buffer[3] = 0x03 // v2.3
  buffer[4] = 0x00
  buffer[5] = 0x00
  buffer[9] = 0x30 // tag size: 48 bytes syncsafe

  // TLEN frame at offset 10
  const tlenId = [0x54, 0x4c, 0x45, 0x4e]
  buffer.set(tlenId, 10)
  const durStr = String(durationMs)
  buffer[17] = durStr.length + 1 // size: 1 encoding + text len
  buffer[20] = 0x00 // ISO-8859-1
  const textBytes = new TextEncoder().encode(durStr)
  buffer.set(textBytes, 21)

  return buffer.buffer as ArrayBuffer
}

/**
 * Builds a valid CBR MP3 frame header (128 kbps, 44.1 kHz).
 */
const createValidMp3CbrBuffer = (): ArrayBuffer => {
  const buffer = new Uint8Array(64)
  buffer[0] = 0xff
  buffer[1] = 0xfb // MPEG-1 Layer 3
  buffer[2] = 0x90 // 128 kbps, 44100 Hz
  buffer[3] = 0x00
  return buffer.buffer as ArrayBuffer
}

// ---------------------------------------------------------------------------
// Standalone Byte Decoders (verbatim logic from id3-parser.ts for micro-benchmarking)
// ---------------------------------------------------------------------------
const microBenchmarkFlacDuration = (buffer: ArrayBuffer): number => {
  if (buffer.byteLength < 26) return 0
  const uint8 = new Uint8Array(buffer)
  if (uint8[0] !== 0x66 || uint8[1] !== 0x4c || uint8[2] !== 0x61 || uint8[3] !== 0x43) return 0
  const view = new DataView(buffer)
  const header = view.getUint8(4)
  if ((header & 0x7f) !== 0) return 0

  const b10 = view.getUint8(18)
  const b11 = view.getUint8(19)
  const b12 = view.getUint8(20)
  const sampleRate = (b10 << 12) | (b11 << 4) | ((b12 >> 4) & 0x0f)

  const b13 = view.getUint8(21)
  const b14 = view.getUint8(22)
  const b15 = view.getUint8(23)
  const b16 = view.getUint8(24)
  const b17 = view.getUint8(25)

  const totalSamplesUpper = b13 & 0x0f
  const totalSamplesLower = ((b14 << 24) >>> 0) + (b15 << 16) + (b16 << 8) + b17
  const totalSamples = totalSamplesUpper * 0x100000000 + totalSamplesLower

  if (sampleRate > 0 && totalSamples > 0) {
    return Math.round((totalSamples / sampleRate) * 1000)
  }
  return 0
}

const microBenchmarkMp3Duration = (buffer: ArrayBuffer, fileSize: number, id3TagSize = 0): number => {
  if (buffer.byteLength < 32) return 0
  const view = new DataView(buffer)
  const totalBytes = buffer.byteLength
  const startOffset = Math.min(id3TagSize, totalBytes - 32)
  const maxScan = Math.min(totalBytes - 4, startOffset + 8192)

  for (let i = startOffset; i < maxScan; i++) {
    if (view.getUint8(i) === 0xff && (view.getUint8(i + 1) & 0xe0) === 0xe0) {
      const b1 = view.getUint8(i + 1)
      const b2 = view.getUint8(i + 2)
      const b3 = view.getUint8(i + 3)

      const mpegVer = (b1 >> 3) & 0x03
      const layer = (b1 >> 1) & 0x03
      if (mpegVer === 1 || layer === 0) continue

      const bitrateIdx = (b2 >> 4) & 0x0f
      const freqIdx = (b2 >> 2) & 0x03
      if (bitrateIdx === 0 || bitrateIdx === 15 || freqIdx === 3) continue

      const channelMode = (b3 >> 6) & 0x03
      const sampleRates =
        mpegVer === 3 ? [44100, 48000, 32000] : mpegVer === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]
      const sampleRate = sampleRates[freqIdx]

      let samplesPerFrame = 1152
      if (layer === 3) samplesPerFrame = 384
      else if (layer === 1 && mpegVer !== 3) samplesPerFrame = 576

      let bitrateKbps = 128
      if (mpegVer === 3 && layer === 1) {
        const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
        bitrateKbps = bitrates[bitrateIdx]
      } else if (layer === 1) {
        const bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
        bitrateKbps = bitrates[bitrateIdx]
      }

      const xingOffset =
        mpegVer === 3 ? (channelMode === 3 ? i + 4 + 17 : i + 4 + 32) : channelMode === 3 ? i + 4 + 9 : i + 4 + 17

      if (xingOffset + 12 <= totalBytes) {
        const isXing =
          view.getUint8(xingOffset) === 0x58 &&
          view.getUint8(xingOffset + 1) === 0x69 &&
          view.getUint8(xingOffset + 2) === 0x6e &&
          view.getUint8(xingOffset + 3) === 0x67
        const isInfo =
          view.getUint8(xingOffset) === 0x49 &&
          view.getUint8(xingOffset + 1) === 0x6e &&
          view.getUint8(xingOffset + 2) === 0x66 &&
          view.getUint8(xingOffset + 3) === 0x6f

        if (isXing || isInfo) {
          const flags = view.getUint32(xingOffset + 4, false)
          if ((flags & 0x01) !== 0) {
            const totalFrames = view.getUint32(xingOffset + 8, false)
            if (totalFrames > 0 && sampleRate > 0) {
              return Math.round(((totalFrames * samplesPerFrame) / sampleRate) * 1000)
            }
          }
        }
      }

      const audioDataSize = fileSize - id3TagSize
      if (audioDataSize > 0 && bitrateKbps > 0) {
        return Math.round(((audioDataSize * 8) / (bitrateKbps * 1000)) * 1000)
      }
      break
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Milestone 2 Challenge: Header Duration Benchmark & Direct Streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  // =========================================================================
  // Challenge 1: Header Duration Benchmark & Audio Element Bypass
  // =========================================================================
  describe('1. Header Duration Micro-Benchmark & Audio Element Bypass', () => {
    it('FLAC STREAMINFO duration parser decodes accurately and executes in <0.1ms (target SLA)', () => {
      const flacBuffer = createValidFlacBuffer(44100, 8820000)

      // Initial sanity check
      const duration = microBenchmarkFlacDuration(flacBuffer)
      expect(duration).toBe(200000) // 200,000 ms

      // Benchmark 10,000 runs
      const iterations = 10000
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        microBenchmarkFlacDuration(flacBuffer)
      }
      const totalElapsedMs = performance.now() - start
      const avgLatencyMs = totalElapsedMs / iterations
      const avgLatencyUs = (avgLatencyMs * 1000).toFixed(3)
      console.log(`[BENCHMARK] FLAC STREAMINFO duration: total=${totalElapsedMs.toFixed(2)}ms, avg=${avgLatencyUs}us (${avgLatencyMs.toFixed(5)}ms per call) over ${iterations} iterations`)

      // Verify execution latency is well below 0.1ms target (<0.01ms typical in V8)
      expect(avgLatencyMs).toBeLessThan(0.1)
      expect(avgLatencyMs).toBeLessThan(0.01)
    })

    it('MP3 Xing VBR duration parser decodes accurately and executes in <0.1ms (target SLA)', () => {
      const mp3XingBuffer = createValidMp3XingBuffer(7656)

      const duration = microBenchmarkMp3Duration(mp3XingBuffer, 3200000, 0)
      expect(duration).toBe(199993) // ~200s

      // Benchmark 10,000 runs
      const iterations = 10000
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        microBenchmarkMp3Duration(mp3XingBuffer, 3200000, 0)
      }
      const totalElapsedMs = performance.now() - start
      const avgLatencyMs = totalElapsedMs / iterations
      const avgLatencyUs = (avgLatencyMs * 1000).toFixed(3)
      console.log(`[BENCHMARK] MP3 Xing VBR duration: total=${totalElapsedMs.toFixed(2)}ms, avg=${avgLatencyUs}us (${avgLatencyMs.toFixed(5)}ms per call) over ${iterations} iterations`)

      expect(avgLatencyMs).toBeLessThan(0.1)
      expect(avgLatencyMs).toBeLessThan(0.01)
    })

    it('MP3 CBR duration parser estimates accurately from frame bitrate and executes in <0.1ms', () => {
      const mp3CbrBuffer = createValidMp3CbrBuffer()
      const fileSize = 3200000 // 3.2MB at 128kbps = 200s

      const duration = microBenchmarkMp3Duration(mp3CbrBuffer, fileSize, 0)
      expect(duration).toBe(200000) // Exactly 200,000 ms

      const iterations = 10000
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        microBenchmarkMp3Duration(mp3CbrBuffer, fileSize, 0)
      }
      const totalElapsedMs = performance.now() - start
      const avgLatencyMs = totalElapsedMs / iterations
      const avgLatencyUs = (avgLatencyMs * 1000).toFixed(3)
      console.log(`[BENCHMARK] MP3 CBR duration: total=${totalElapsedMs.toFixed(2)}ms, avg=${avgLatencyUs}us (${avgLatencyMs.toFixed(5)}ms per call) over ${iterations} iterations`)

      expect(avgLatencyMs).toBeLessThan(0.1)
    })

    it('end-to-end parseAudioFileMetadata with valid header duration runs in <2ms per file', async () => {
      const flacBuffer = createValidFlacBuffer(44100, 8820000)
      const file = new File([flacBuffer], 'benchmark_track.flac', { type: 'audio/flac' })

      // Warm up
      await parseAudioFileMetadata(file)

      const runs = 100
      const start = performance.now()
      for (let i = 0; i < runs; i++) {
        await parseAudioFileMetadata(file)
      }
      const totalElapsedMs = performance.now() - start
      const avgMs = totalElapsedMs / runs
      console.log(`[BENCHMARK] End-to-end parseAudioFileMetadata (FLAC): total=${totalElapsedMs.toFixed(2)}ms, avg=${avgMs.toFixed(3)}ms per file over ${runs} runs`)

      // Without new Audio(), the entire tag extraction and duration decode completes in <2ms
      expect(avgMs).toBeLessThan(2.0)
    })

    it('handles corrupted, truncated, or zero-sample headers gracefully without throwing', () => {
      // Buffer smaller than minimum header size
      expect(microBenchmarkFlacDuration(new ArrayBuffer(10))).toBe(0)
      expect(microBenchmarkMp3Duration(new ArrayBuffer(10), 1000)).toBe(0)

      // Corrupt FLAC signature
      const corruptFlac = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
      expect(microBenchmarkFlacDuration(corruptFlac.buffer as ArrayBuffer)).toBe(0)

      // Zero sample rate
      const zeroSrFlac = createValidFlacBuffer(0, 1000)
      expect(microBenchmarkFlacDuration(zeroSrFlac)).toBe(0)

      // Zero total samples
      const zeroSamplesFlac = createValidFlacBuffer(44100, 0)
      expect(microBenchmarkFlacDuration(zeroSamplesFlac)).toBe(0)
    })

    it('verifies that when header duration is valid (FLAC), new Audio() is NEVER instantiated', async () => {
      const flacBuffer = createValidFlacBuffer(44100, 8820000)
      const file = new File([flacBuffer], 'track.flac', { type: 'audio/flac' })

      const audioConstructorSpy = vi.spyOn(window, 'Audio')

      const meta = await parseAudioFileMetadata(file)

      // Duration correctly decoded from STREAMINFO
      expect(meta.durationMs).toBe(200000)
      // Assert zero Audio element instantiations occurred
      expect(audioConstructorSpy).not.toHaveBeenCalled()
    })

    it('verifies that when header duration is valid (MP3 TLEN), new Audio() is NEVER instantiated', async () => {
      const tlenBuffer = createValidMp3TlenBuffer(195000)
      const file = new File([tlenBuffer], 'track.mp3', { type: 'audio/mpeg' })

      const audioConstructorSpy = vi.spyOn(window, 'Audio')

      const meta = await parseAudioFileMetadata(file)

      expect(meta.durationMs).toBe(195000)
      expect(audioConstructorSpy).not.toHaveBeenCalled()
    })

    it('verifies that when header duration is valid (MP3 Xing), new Audio() is NEVER instantiated', async () => {
      const xingBuffer = createValidMp3XingBuffer(7656)
      const file = new File([xingBuffer], 'track.mp3', { type: 'audio/mpeg' })

      const audioConstructorSpy = vi.spyOn(window, 'Audio')

      const meta = await parseAudioFileMetadata(file)

      expect(meta.durationMs).toBe(199993)
      expect(audioConstructorSpy).not.toHaveBeenCalled()
    })

    it('verifies that new Audio() IS instantiated as fallback ONLY when header duration is absent/corrupt', async () => {
      // Raw dummy bytes without any valid audio headers or tags
      const rawBuffer = new Uint8Array(64).fill(0xaa)
      const file = new File([rawBuffer], 'corrupted_audio.wav', { type: 'audio/wav' })

      const audioConstructorSpy = vi.spyOn(window, 'Audio')

      await parseAudioFileMetadata(file)

      // Because header parsing returned 0, it fell back to new Audio()
      expect(audioConstructorSpy).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // Challenge 2: Direct Stream URL Resolution (PlexAudioProvider.resolvePartUrl)
  // =========================================================================
  describe('2. Direct Stream URL Resolution (PlexAudioProvider)', () => {
    beforeEach(() => {
      vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
      vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    })

    it('when track.partKey is present, resolves stream URL synchronously with ZERO network calls to /library/metadata', async () => {
      const fetchSpy = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }))
      global.fetch = fetchSpy

      const trackWithPartKey: PlexTrackInfo = {
        id: 'plex-direct-1',
        ratingKey: '9901',
        title: 'Direct Stream Track',
        artist: 'Direct Artist',
        albumName: 'Direct Album',
        albumArt: 'http://plex.server:32400/art/9901',
        durationMs: 240000,
        plexBaseUrl: 'http://plex.server:32400',
        plexToken: 'secret-token-xyz',
        partKey: '/library/parts/88888/file.flac',
      }

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playTrack(trackWithPartKey)
      })

      // Inspect all calls made to fetch
      const metadataCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes('/library/metadata/'),
      )

      // Verified: ZERO network round-trips to /library/metadata!
      expect(metadataCalls).toHaveLength(0)

      // Current track is set and playback initiated
      expect(result.current.currentTrack?.id).toBe('plex-direct-1')
      expect(result.current.error).toBeNull()
    })

    it('when track.partKey is missing, falls back to fetching /library/metadata/{ratingKey}', async () => {
      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/library/metadata/9902')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              MediaContainer: {
                Metadata: [
                  {
                    Media: [{ Part: [{ key: '/library/parts/fallback-9902.mp3' }] }],
                  },
                ],
              },
            }),
          }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })
      global.fetch = fetchSpy

      const trackWithoutPartKey: PlexTrackInfo = {
        id: 'plex-fallback-2',
        ratingKey: '9902',
        title: 'Fallback Stream Track',
        artist: 'Fallback Artist',
        albumName: 'Fallback Album',
        albumArt: null,
        durationMs: 180000,
        plexBaseUrl: 'http://plex.server:32400',
        plexToken: 'token-abc',
        partKey: undefined, // No direct partKey!
      }

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playTrack(trackWithoutPartKey)
      })

      // Verified: When partKey is omitted, it queries the metadata endpoint
      const metadataCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes('/library/metadata/9902'),
      )
      expect(metadataCalls.length).toBeGreaterThanOrEqual(1)
      expect(result.current.currentTrack?.id).toBe('plex-fallback-2')
    })

    it('handles relative partKey without leading slash cleanly', async () => {
      const fetchSpy = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }))
      global.fetch = fetchSpy

      const trackWithRelativePart: PlexTrackInfo = {
        id: 'plex-rel-3',
        ratingKey: '9903',
        title: 'Relative Part Track',
        artist: 'Artist',
        albumName: 'Album',
        albumArt: null,
        durationMs: 200000,
        plexBaseUrl: 'http://plex.server:32400',
        plexToken: 'token-rel',
        partKey: 'library/parts/relative.flac', // No leading slash
      }

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playTrack(trackWithRelativePart)
      })

      // Zero metadata network calls
      const metadataCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes('/library/metadata/'),
      )
      expect(metadataCalls).toHaveLength(0)
    })

    it('fails gracefully and sets error when plexBaseUrl or plexToken is missing', async () => {
      const trackMissingAuth: PlexTrackInfo = {
        id: 'plex-bad-auth',
        ratingKey: '9904',
        title: 'Unauthenticated Track',
        artist: 'Artist',
        albumName: 'Album',
        albumArt: null,
        durationMs: 120000,
        plexBaseUrl: null, // Missing base url!
        plexToken: null,
        partKey: '/library/parts/file.mp3',
      }

      const { result } = renderHook(() => usePlexPlayer(), {
        wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
      })

      await act(async () => {
        await result.current.playTrack(trackMissingAuth)
      })

      expect(result.current.error).toMatch(/Missing Plex connection info/i)
    })
  })

  // =========================================================================
  // Challenge 3: React Re-render Verification (MusicTrackRow)
  // =========================================================================
  describe('3. React Re-render Verification (MusicTrackRow)', () => {
    it('verifies MusicTrackRow does NOT re-render when sibling track states change and its own props remain stable', async () => {
      const musicHelpers = await import('../utils/music-helpers')
      const formatSpy = vi.spyOn(musicHelpers, 'formatTrackDuration')

      // Stable callbacks map
      const stableCallbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]

      const TrackListHarness = () => {
        const [activeIdx, setActiveIdx] = useState(0)

        return (
          <div>
            <button data-testid="select-track-1" onClick={() => setActiveIdx(1)}>
              Select Track 1
            </button>
            {[0, 1, 2, 3].map((i) => (
              <MusicTrackRow
                key={i}
                index={i}
                title={`Track ${i}`}
                artist="Artist"
                durationMs={100000 + i}
                isActive={activeIdx === i}
                isPlaying={activeIdx === i}
                onPlay={stableCallbacks[i]}
              />
            ))}
          </div>
        )
      }

      render(<TrackListHarness />)

      // Initial mount: all 4 rows rendered exactly 1 time
      expect(formatSpy).toHaveBeenCalledTimes(4)
      expect(formatSpy).toHaveBeenNthCalledWith(1, 100000)
      expect(formatSpy).toHaveBeenNthCalledWith(2, 100001)
      expect(formatSpy).toHaveBeenNthCalledWith(3, 100002)
      expect(formatSpy).toHaveBeenNthCalledWith(4, 100003)

      formatSpy.mockClear()

      // Switch active track from 0 to 1
      fireEvent.click(screen.getByTestId('select-track-1'))

      // Track 0 re-rendered (isActive -> false)
      // Track 1 re-rendered (isActive -> true)
      // Sibling Track 2 and Track 3 MUST NOT re-render (formatTrackDuration NOT called for them)!
      expect(formatSpy).toHaveBeenCalledTimes(2)
      const calledDurations = formatSpy.mock.calls.map((call) => call[0])
      expect(calledDurations).toEqual([100000, 100001])
      expect(calledDurations).not.toContain(100002)
      expect(calledDurations).not.toContain(100003)
    })

    it('verifies MusicTrackRow does NOT re-render when parent re-renders with unrelated state', async () => {
      const musicHelpers = await import('../utils/music-helpers')
      const formatSpy = vi.spyOn(musicHelpers, 'formatTrackDuration')
      const onPlay = vi.fn()

      const ParentHarness = () => {
        const [tick, setTick] = useState(0)

        return (
          <div>
            <button data-testid="bump-tick" onClick={() => setTick((t) => t + 1)}>
              Tick {tick}
            </button>
            <MusicTrackRow
              index={0}
              title="Stable Track"
              artist="Stable Artist"
              durationMs={150000}
              isActive={false}
              isPlaying={false}
              onPlay={onPlay}
            />
          </div>
        )
      }

      render(<ParentHarness />)
      expect(formatSpy).toHaveBeenCalledTimes(1)
      formatSpy.mockClear()

      // Bump tick in parent 5 times
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('bump-tick'))
      }

      // MusicTrackRow remained memoized and did NOT re-render (0 invocations)
      expect(formatSpy).not.toHaveBeenCalled()
    })

    it('empirically demonstrates that inline arrow onPlay callbacks invalidate memoization', async () => {
      const musicHelpers = await import('../utils/music-helpers')
      const formatSpy = vi.spyOn(musicHelpers, 'formatTrackDuration')

      // Demonstrates the pitfall when parent passes inline `() => play(track)`
      const ParentWithInlineCallbacks = () => {
        const [, setTick] = useState(0)

        return (
          <div>
            <button data-testid="parent-tick" onClick={() => setTick((t) => t + 1)}>
              Tick
            </button>
            {[0, 1].map((i) => (
              <MusicTrackRow
                key={i}
                index={i}
                title={`Track ${i}`}
                artist="Artist"
                durationMs={120000 + i}
                isActive={false}
                isPlaying={false}
                // Inline arrow function creates a new reference on every render
                onPlay={() => {}}
              />
            ))}
          </div>
        )
      }

      render(<ParentWithInlineCallbacks />)
      expect(formatSpy).toHaveBeenCalledTimes(2)
      formatSpy.mockClear()

      fireEvent.click(screen.getByTestId('parent-tick'))

      // Because onPlay was recreated inline, memo() shallow comparison failed and both rows re-rendered!
      expect(formatSpy).toHaveBeenCalledTimes(2)
    })
  })
})
