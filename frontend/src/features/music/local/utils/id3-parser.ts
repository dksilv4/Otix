export interface ParsedAudioMetadata {
  title: string
  artist: string
  albumName: string
  trackNumber: number | null
  year: string | null
  albumArt: string | null
  albumArtBlob: Blob | null
  durationMs: number
}

const decodeText = (bytes: Uint8Array, encoding: number): string => {
  try {
    if (encoding === 0) {
      // ISO-8859-1 (Latin1)
      let str = ''
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) break
        str += String.fromCharCode(bytes[i])
      }
      return str.trim()
    } else if (encoding === 1) {
      // UTF-16 with BOM
      const decoder = new TextDecoder('utf-16')
      return decoder.decode(bytes).replace(/\0+$/, '').trim()
    } else if (encoding === 2) {
      // UTF-16BE without BOM
      const decoder = new TextDecoder('utf-16be')
      return decoder.decode(bytes).replace(/\0+$/, '').trim()
    } else {
      // UTF-8
      const decoder = new TextDecoder('utf-8')
      return decoder.decode(bytes).replace(/\0+$/, '').trim()
    }
  } catch {
    return ''
  }
}

const readSyncsafeInteger = (view: DataView, offset: number): number => {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  )
}

const parseAPICFrame = (data: Uint8Array): Blob | null => {
  if (data.length < 10) return null
  try {
    const encoding = data[0]
    let pos = 1

    // Read MIME type (ISO-8859-1 null-terminated)
    let mimeType = ''
    while (pos < data.length && data[pos] !== 0) {
      mimeType += String.fromCharCode(data[pos])
      pos++
    }
    pos++ // Skip null byte
    if (!mimeType) mimeType = 'image/jpeg'

    // Picture type byte (1 byte)
    pos++

    // Skip description (null-terminated depending on encoding)
    if (encoding === 1 || encoding === 2) {
      while (pos + 1 < data.length && !(data[pos] === 0 && data[pos + 1] === 0)) {
        pos += 2
      }
      pos += 2
    } else {
      while (pos < data.length && data[pos] !== 0) {
        pos++
      }
      pos++
    }

    if (pos >= data.length) return null

    const imgBytes = data.subarray(pos)
    const bufEnd = imgBytes.byteOffset + imgBytes.byteLength
    const arrayBuf = imgBytes.buffer.slice(imgBytes.byteOffset, bufEnd) as ArrayBuffer
    return new Blob([arrayBuf], { type: mimeType })
  } catch {
    return null
  }
}

const parseID3v2 = (buffer: ArrayBuffer): Partial<ParsedAudioMetadata> => {
  const result: Partial<ParsedAudioMetadata> = {}
  if (buffer.byteLength < 10) return result

  const view = new DataView(buffer)
  // Check 'ID3' header
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return result
  }

  const majorVersion = view.getUint8(3)
  const tagSize = readSyncsafeInteger(view, 6)
  const totalTagBytes = Math.min(buffer.byteLength, 10 + tagSize)
  let offset = 10

  while (offset + 10 < totalTagBytes) {
    // Frame ID (4 ASCII chars)
    const frameIdBytes = [
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    ]

    // Stop on padding (zero bytes)
    if (frameIdBytes[0] === 0) break

    const frameId = String.fromCharCode(...frameIdBytes)

    const frameSize =
      majorVersion === 4 ? readSyncsafeInteger(view, offset + 4) : view.getUint32(offset + 4)

    if (frameSize <= 0 || offset + 10 + frameSize > totalTagBytes) break

    const frameData = new Uint8Array(buffer, offset + 10, frameSize)
    offset += 10 + frameSize

    if (frameData.length === 0) continue

    const encoding = frameData[0]
    const textBytes = frameData.subarray(1)

    switch (frameId) {
      case 'TIT2': // Title
        result.title = decodeText(textBytes, encoding)
        break
      case 'TPE1': // Artist
        result.artist = decodeText(textBytes, encoding)
        break
      case 'TALB': // Album
        result.albumName = decodeText(textBytes, encoding)
        break
      case 'TRCK': { // Track number
        const trackStr = decodeText(textBytes, encoding)
        const match = trackStr.match(/^(\d+)/)
        if (match) result.trackNumber = parseInt(match[1], 10)
        break
      }
      case 'TYER': // Year (ID3v2.3)
      case 'TDRC': // Recording date (ID3v2.4)
        result.year = decodeText(textBytes, encoding).slice(0, 4)
        break
      case 'TLEN': { // Length in milliseconds
        const lenStr = decodeText(textBytes, encoding)
        const val = parseInt(lenStr, 10)
        if (!isNaN(val) && val > 0) {
          result.durationMs = val
        }
        break
      }
      case 'APIC': // Attached Picture
        result.albumArtBlob = parseAPICFrame(frameData)
        break
    }
  }

  return result
}

const parseVorbisComments = (buffer: ArrayBuffer): Partial<ParsedAudioMetadata> => {
  const result: Partial<ParsedAudioMetadata> = {}
  try {
    const uint8 = new Uint8Array(buffer)
    // Check FLAC header 'fLaC'
    if (uint8[0] === 0x66 && uint8[1] === 0x4c && uint8[2] === 0x61 && uint8[3] === 0x43) {
      let offset = 4
      const view = new DataView(buffer)

      while (offset < uint8.length) {
        const header = view.getUint8(offset)
        const isLast = (header & 0x80) !== 0
        const blockType = header & 0x7f
        const blockSize =
          (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3)
        offset += 4

        if (blockType === 4 && offset + blockSize <= uint8.length) {
          // VORBIS_COMMENT block
          const commentView = new DataView(buffer, offset, blockSize)
          let cOffset = 0
          const vendorLength = commentView.getUint32(cOffset, true)
          cOffset += 4 + vendorLength
          const userCommentCount = commentView.getUint32(cOffset, true)
          cOffset += 4

          for (let i = 0; i < userCommentCount && cOffset + 4 < blockSize; i++) {
            const commentLen = commentView.getUint32(cOffset, true)
            cOffset += 4
            if (cOffset + commentLen > blockSize) break
            const commentBytes = new Uint8Array(buffer, offset + cOffset, commentLen)
            const commentStr = new TextDecoder().decode(commentBytes)
            cOffset += commentLen

            const eqIdx = commentStr.indexOf('=')
            if (eqIdx !== -1) {
              const key = commentStr.slice(0, eqIdx).toUpperCase()
              const val = commentStr.slice(eqIdx + 1).trim()
              if (key === 'TITLE') result.title = val
              else if (key === 'ARTIST') result.artist = val
              else if (key === 'ALBUM') result.albumName = val
              else if (key === 'TRACKNUMBER') {
                const num = parseInt(val, 10)
                if (!isNaN(num)) result.trackNumber = num
              } else if (key === 'DATE') {
                result.year = val.slice(0, 4)
              }
            }
          }
        } else if (blockType === 6 && offset + blockSize <= uint8.length) {
          // PICTURE block
          const picView = new DataView(buffer, offset, blockSize)
          let pOffset = 4 // skip picture type (4 bytes)
          const mimeLen = picView.getUint32(pOffset, false)
          pOffset += 4
          const mimeBytes = new Uint8Array(buffer, offset + pOffset, mimeLen)
          const mimeType = new TextDecoder().decode(mimeBytes) || 'image/jpeg'
          pOffset += mimeLen
          const descLen = picView.getUint32(pOffset, false)
          pOffset += 4 + descLen // skip description
          pOffset += 16 // skip width, height, color depth, colors (4*4 bytes)
          const dataLen = picView.getUint32(pOffset, false)
          pOffset += 4
          if (pOffset + dataLen <= blockSize) {
            const imgData = new Uint8Array(buffer, offset + pOffset, dataLen)
            const bufEnd = imgData.byteOffset + imgData.byteLength
            const arrayBuf = imgData.buffer.slice(imgData.byteOffset, bufEnd) as ArrayBuffer
            result.albumArtBlob = new Blob([arrayBuf], { type: mimeType })
          }
        }

        offset += blockSize
        if (isLast) break
      }
    }
  } catch {
    // Ignore Vorbis comment parsing failure
  }
  return result
}

/**
 * Fast FLAC duration decoder: extracts sample_rate and total_samples directly
 * from the STREAMINFO metadata block (bytes 10-18) in <0.01ms without audio decoders.
 */
const parseFlacStreamInfoDuration = (buffer: ArrayBuffer): number => {
  if (buffer.byteLength < 26) return 0
  const uint8 = new Uint8Array(buffer)
  // Check 'fLaC' header
  if (uint8[0] !== 0x66 || uint8[1] !== 0x4c || uint8[2] !== 0x61 || uint8[3] !== 0x43) {
    return 0
  }
  const view = new DataView(buffer)
  const header = view.getUint8(4)
  const blockType = header & 0x7f
  if (blockType !== 0) return 0 // First block must be STREAMINFO

  // STREAMINFO data starts at offset 8 (after 4-byte fLaC + 4-byte block header).
  // Bytes 10-18 of STREAMINFO:
  // Offset 18: sample_rate bits 19-12
  // Offset 19: sample_rate bits 11-4
  // Offset 20: sample_rate bits 3-0 in upper 4 bits
  const b10 = view.getUint8(18)
  const b11 = view.getUint8(19)
  const b12 = view.getUint8(20)
  const sampleRate = (b10 << 12) | (b11 << 4) | ((b12 >> 4) & 0x0f)

  // Total samples (36 bits):
  // Offset 21: bits 35-32 in lower 4 bits
  // Offsets 22-25: bits 31-0
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

/**
 * Fast MP3 duration decoder: scans for Xing / Info VBR header or estimates from CBR bitrate
 * in <0.01ms without allocating native browser HTMLAudioElement decoders.
 */
const parseMp3HeaderDuration = (buffer: ArrayBuffer, fileSize: number, id3TagSize = 0): number => {
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
        mpegVer === 3
          ? [44100, 48000, 32000]
          : mpegVer === 2
            ? [22050, 24000, 16000]
            : [11025, 12000, 8000]
      const sampleRate = sampleRates[freqIdx]

      let samplesPerFrame = 1152
      if (layer === 3) {
        samplesPerFrame = 384
      } else if (layer === 1 && mpegVer !== 3) {
        samplesPerFrame = 576
      }

      let bitrateKbps = 128
      if (mpegVer === 3 && layer === 1) {
        const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
        bitrateKbps = bitrates[bitrateIdx]
      } else if (layer === 1) {
        const bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
        bitrateKbps = bitrates[bitrateIdx]
      }

      const xingOffset =
        mpegVer === 3
          ? channelMode === 3
            ? i + 4 + 17
            : i + 4 + 32
          : channelMode === 3
            ? i + 4 + 9
            : i + 4 + 17

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

const parseFilenameFallback = (fileName: string): Partial<ParsedAudioMetadata> => {
  const cleanName = fileName.replace(/\.[a-zA-Z0-9]+$/, '')
  // Patterns like "01 - Bohemian Rhapsody" or "Queen - Bohemian Rhapsody"
  const trackMatch = cleanName.match(/^(\d+)[\s._-]+(.+)$/)
  if (trackMatch) {
    return {
      trackNumber: parseInt(trackMatch[1], 10),
      title: trackMatch[2].trim(),
    }
  }
  const artistMatch = cleanName.match(/^([^-]+)-(.+)$/)
  if (artistMatch) {
    return {
      artist: artistMatch[1].trim(),
      title: artistMatch[2].trim(),
    }
  }
  return {
    title: cleanName,
  }
}

/**
 * Parses an audio File or Blob to extract tags, duration, and embedded album art.
 */
export const parseAudioFileMetadata = async (
  file: File | Blob,
  fallbackFileName?: string,
): Promise<ParsedAudioMetadata> => {
  const fileName = (file as File).name || fallbackFileName || 'Unknown Audio'
  const fallback = parseFilenameFallback(fileName)
  let partial: Partial<ParsedAudioMetadata> = {}

  try {
    // Read first 1MB for headers, ID3/Vorbis tags, and embedded album art
    const headerSlice = file.slice(0, Math.min(file.size, 1024 * 1024))
    const buffer = await headerSlice.arrayBuffer()

    const id3 = parseID3v2(buffer)
    const vorbis = parseVorbisComments(buffer)
    partial = { ...id3, ...vorbis }

    // Fast header-based duration parsing (<0.01ms):
    // 1. FLAC STREAMINFO header (sample_rate & total_samples)
    let headerDuration = parseFlacStreamInfoDuration(buffer)
    // 2. ID3 TLEN tag
    if (!headerDuration && partial.durationMs) {
      headerDuration = partial.durationMs
    }
    // 3. MP3 Xing / Info header or CBR frame bitrate
    if (!headerDuration) {
      const uint8 = new Uint8Array(buffer)
      const tagSize =
        uint8.length >= 10 && uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33
          ? readSyncsafeInteger(new DataView(buffer), 6) + 10
          : 0
      headerDuration = parseMp3HeaderDuration(buffer, file.size, tagSize)
    }
    if (headerDuration > 0) {
      partial.durationMs = headerDuration
    }
  } catch (err) {
    console.warn('[id3-parser] Failed to read header tags for', fileName, err)
  }

  let durationMs = partial.durationMs && partial.durationMs > 0 ? partial.durationMs : 0

  // Fall back to native Audio element only when header-based duration parsing returned 0
  if (durationMs === 0) {
    try {
      const objectUrl = URL.createObjectURL(file)
      durationMs = await new Promise<number>((resolve) => {
        const audio = new Audio()
        audio.preload = 'metadata'
        let timer: ReturnType<typeof setTimeout> | null = null

        const cleanup = () => {
          if (timer) clearTimeout(timer)
          audio.removeEventListener('loadedmetadata', onLoaded)
          audio.removeEventListener('error', onError)
          try {
            URL.revokeObjectURL(objectUrl)
          } catch {
            // Ignore revoke error
          }
        }
        const onLoaded = () => {
          const dur = isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0
          cleanup()
          resolve(dur)
        }
        const onError = () => {
          cleanup()
          resolve(0)
        }

        // Safety timeout: in jsdom or headless environments, audio metadata doesn't fire
        timer = setTimeout(() => {
          cleanup()
          resolve(0)
        }, 200)

        audio.addEventListener('loadedmetadata', onLoaded)
        audio.addEventListener('error', onError)
        audio.src = objectUrl
      })
    } catch {
      durationMs = 0
    }
  }

  return {
    title: partial.title || fallback.title || fileName,
    artist: partial.artist || fallback.artist || 'Unknown Artist',
    albumName: partial.albumName || 'Unknown Album',
    trackNumber: partial.trackNumber ?? fallback.trackNumber ?? null,
    year: partial.year ?? null,
    albumArt: partial.albumArt ?? null,
    albumArtBlob: partial.albumArtBlob ?? null,
    durationMs,
  }
}
