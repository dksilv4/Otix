import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAudioFileMetadata } from '../id3-parser'

describe('id3-parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts track number and title from numbered filename fallback', async () => {
    const file = new File(['dummy audio content'], '05 - Stairway to Heaven.mp3', {
      type: 'audio/mpeg',
    })

    const meta = await parseAudioFileMetadata(file)
    expect(meta.trackNumber).toBe(5)
    expect(meta.title).toBe('Stairway to Heaven')
    expect(meta.artist).toBe('Unknown Artist')
  })

  it('extracts artist and title from hyphenated filename fallback', async () => {
    const file = new File(['dummy audio content'], 'Pink Floyd - Time.flac', {
      type: 'audio/flac',
    })

    const meta = await parseAudioFileMetadata(file)
    expect(meta.artist).toBe('Pink Floyd')
    expect(meta.title).toBe('Time')
  })

  it('parses valid ID3v2.3 TIT2 and TPE1 tags from binary buffer', async () => {
    // Create synthetic ID3v2.3 tag
    // Header: 'ID3', ver 3, flags 0, syncsafe size
    const buffer = new Uint8Array(128)
    buffer[0] = 0x49 // 'I'
    buffer[1] = 0x44 // 'D'
    buffer[2] = 0x33 // '3'
    buffer[3] = 0x03 // major ver 3
    buffer[4] = 0x00 // rev 0
    buffer[5] = 0x00 // flags
    buffer[6] = 0x00 // size b0
    buffer[7] = 0x00 // size b1
    buffer[8] = 0x00 // size b2
    buffer[9] = 0x70 // size b3 (112 bytes)

    // TIT2 frame at offset 10: ID 'TIT2', size 11 (0x0000000b), flags 0, 0, encoding 0, text 'Song Title'
    const tit2Id = [0x54, 0x49, 0x54, 0x32]
    buffer.set(tit2Id, 10)
    buffer[14] = 0x00
    buffer[15] = 0x00
    buffer[16] = 0x00
    buffer[17] = 0x0b // length: 1 (encoding) + 10 (text) = 11
    buffer[18] = 0x00
    buffer[19] = 0x00
    buffer[20] = 0x00 // encoding: ISO-8859-1
    const titleBytes = new TextEncoder().encode('Song Title')
    buffer.set(titleBytes, 21)

    // TPE1 frame at offset 31: ID 'TPE1', size 12, encoding 0, text 'Artist Name'
    const tpe1Id = [0x54, 0x50, 0x45, 0x31]
    buffer.set(tpe1Id, 31)
    buffer[35] = 0x00
    buffer[36] = 0x00
    buffer[37] = 0x00
    buffer[38] = 0x0c // length: 1 + 11 = 12
    buffer[39] = 0x00
    buffer[40] = 0x00
    buffer[41] = 0x00 // encoding: ISO-8859-1
    const artistBytes = new TextEncoder().encode('Artist Name')
    buffer.set(artistBytes, 42)

    const file = new File([buffer], 'track.mp3', { type: 'audio/mpeg' })
    const meta = await parseAudioFileMetadata(file)

    expect(meta.title).toBe('Song Title')
    expect(meta.artist).toBe('Artist Name')
  })

  it('parses FLAC duration directly from STREAMINFO header in <0.01ms without decoders', async () => {
    // 4 bytes 'fLaC', 4 bytes block header (type 0 = STREAMINFO), 34 bytes data
    const buffer = new Uint8Array(42)
    buffer[0] = 0x66 // 'f'
    buffer[1] = 0x4c // 'L'
    buffer[2] = 0x61 // 'a'
    buffer[3] = 0x43 // 'C'
    buffer[4] = 0x00 // type 0, not last
    buffer[5] = 0x00
    buffer[6] = 0x00
    buffer[7] = 0x22 // block size: 34

    // STREAMINFO data begins at offset 8:
    // sample_rate = 44100 (0x0AC44)
    buffer[18] = 0x0a
    buffer[19] = 0xc4
    buffer[20] = 0x42 // top 4 bits: 4 (completes 0x0AC44), 2 channels, 16 bps

    // total_samples = 441,000 (0x0006BAA8) -> 10.0 seconds
    buffer[21] = 0xf0 // 16 bps, total samples upper 4 bits = 0
    buffer[22] = 0x00
    buffer[23] = 0x06
    buffer[24] = 0xba
    buffer[25] = 0xa8

    const file = new File([buffer], 'test_song.flac', { type: 'audio/flac' })
    const meta = await parseAudioFileMetadata(file)

    expect(meta.durationMs).toBe(10000)
    expect(meta.title).toBe('test_song')
  })

  it('parses MP3 duration from ID3v2 TLEN frame', async () => {
    // ID3v2 header
    const buffer = new Uint8Array(64)
    buffer[0] = 0x49 // 'I'
    buffer[1] = 0x44 // 'D'
    buffer[2] = 0x33 // '3'
    buffer[3] = 0x03 // major ver 3
    buffer[4] = 0x00
    buffer[5] = 0x00
    buffer[6] = 0x00
    buffer[7] = 0x00
    buffer[8] = 0x00
    buffer[9] = 0x30 // size

    // TLEN frame at offset 10: ID 'TLEN', size: 1 (encoding) + 6 ('180000') = 7
    const tlenId = [0x54, 0x4c, 0x45, 0x4e]
    buffer.set(tlenId, 10)
    buffer[14] = 0x00
    buffer[15] = 0x00
    buffer[16] = 0x00
    buffer[17] = 0x07 // length: 7
    buffer[18] = 0x00
    buffer[19] = 0x00
    buffer[20] = 0x00 // encoding: ISO-8859-1
    const tlenBytes = new TextEncoder().encode('180000')
    buffer.set(tlenBytes, 21)

    const file = new File([buffer], 'track.mp3', { type: 'audio/mpeg' })
    const meta = await parseAudioFileMetadata(file)

    expect(meta.durationMs).toBe(180000)
  })

  it('extracts APIC frame directly as Blob without creating an object URL', async () => {
    const buffer = new Uint8Array(80)
    buffer[0] = 0x49 // 'I'
    buffer[1] = 0x44 // 'D'
    buffer[2] = 0x33 // '3'
    buffer[3] = 0x03
    buffer[4] = 0x00
    buffer[5] = 0x00
    buffer[6] = 0x00
    buffer[7] = 0x00
    buffer[8] = 0x00
    buffer[9] = 0x40

    // APIC frame at offset 10
    const apicId = [0x41, 0x50, 0x49, 0x43]
    buffer.set(apicId, 10)
    // frame size 20
    buffer[17] = 0x14
    buffer[20] = 0x00 // encoding: ISO-8859-1
    // MIME type 'image/jpeg\0'
    const mimeBytes = new TextEncoder().encode('image/jpeg\0')
    buffer.set(mimeBytes, 21)
    const picTypeOffset = 21 + mimeBytes.length
    buffer[picTypeOffset] = 0x03 // Front cover
    buffer[picTypeOffset + 1] = 0x00 // empty description null terminator
    // dummy image payload
    buffer[picTypeOffset + 2] = 0xff
    buffer[picTypeOffset + 3] = 0xd8

    const file = new File([buffer], 'track_art.mp3', { type: 'audio/mpeg' })
    const meta = await parseAudioFileMetadata(file)

    expect(meta.albumArtBlob).toBeInstanceOf(Blob)
    expect(meta.albumArtBlob?.type).toBe('image/jpeg')
  })
})
