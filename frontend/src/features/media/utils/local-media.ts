import type { StreamPlaybackSession } from '../types/stream-player'
import type { LocalTrackInfo } from '@/lib/player/types'
import { getDesktopAPI } from '@/lib/desktop/api'
import { parseAudioFileMetadata, type ParsedAudioMetadata } from '@/features/music/local/utils/id3-parser'

export const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'opus',
  'wma',
])

export function isAudioFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXTENSIONS.has(ext)
}

/**
 * In-memory cache of fully enriched local audio tracks by file path.
 */
export const localTrackCache = new Map<string, LocalTrackInfo>()

/**
 * Builds a direct playback session for a local video file.
 */
export function buildLocalMediaSession(filePath: string): StreamPlaybackSession {
  const normalized = filePath.replace(/\\/g, '/')
  const rawFileName = normalized.split('/').pop() || 'Video File'
  const ext = rawFileName.includes('.') ? rawFileName.split('.').pop()!.toLowerCase() : 'mp4'
  const displayName = rawFileName.replace(/\.[^/.]+$/, '')
  const directUrl = `local-media://localhost?path=${encodeURIComponent(filePath)}`

  return {
    source: 'local',
    serverUrl: '',
    token: '',
    itemId: `local-${Date.now()}`,
    title: displayName || rawFileName,
    subtitle: filePath,
    playSessionId: `local-session-${Date.now()}`,
    directUrl,
    hlsUrl: '',
    audioTracks: [],
    subtitles: [],
    container: ext,
    videoCodec: 'h264',
    audioCodec: 'aac',
    selectedQuality: 'original',
  }
}

/**
 * Builds a LocalTrackInfo object for a local audio file to play in Otix Music Player.
 */
export function buildLocalAudioTrack(
  filePath: string,
  metadata?: Partial<ParsedAudioMetadata> & { albumArtUrl?: string | null },
): LocalTrackInfo {
  const normalized = filePath.replace(/\\/g, '/')
  const rawFileName = normalized.split('/').pop() || 'Audio Track'
  const displayName = rawFileName.replace(/\.[^/.]+$/, '')
  const directUrl = `local-media://localhost?path=${encodeURIComponent(filePath)}`

  let artist = metadata?.artist || 'Local Audio'
  let title = metadata?.title || displayName
  if (!metadata?.title && !metadata?.artist && displayName.includes(' - ')) {
    const parts = displayName.split(' - ')
    artist = parts[0].trim()
    title = parts.slice(1).join(' - ').trim()
  }

  return {
    id: `local-audio-${encodeURIComponent(filePath)}`,
    url: directUrl,
    title,
    artist,
    albumName: metadata?.albumName || 'Local Music',
    albumArt: metadata?.albumArtUrl ?? metadata?.albumArt ?? null,
    durationMs: metadata?.durationMs || 0,
    trackNumber: metadata?.trackNumber ?? undefined,
    path: filePath,
  }
}

/**
 * Queries iTunes public Search API for official high-resolution album artwork.
 */
export async function fetchOnlineAlbumArt(artist: string, albumOrTitle: string): Promise<string | null> {
  if (!artist || artist === 'Local Audio' || artist === 'Unknown Artist') {
    if (!albumOrTitle || albumOrTitle === 'Unknown Album' || albumOrTitle === 'Local Music') return null
  }
  try {
    const term = `${artist} ${albumOrTitle}`.trim()
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`
    const resp = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!resp.ok) return null
    const data = await resp.json()
    const first = data?.results?.[0]
    if (first?.artworkUrl100) {
      return first.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')
    }
    return null
  } catch {
    return null
  }
}

/**
 * Reads tags, embedded cover art, duration, and local/remote artwork for a specific local audio file.
 * Returns cached data if this file path has already been enriched.
 */
export async function resolveLocalAudioTrack(
  filePath: string,
  folderCoverPath?: string | null,
): Promise<LocalTrackInfo> {
  const cached = localTrackCache.get(filePath)
  if (cached && (cached.albumArt || cached.durationMs > 0)) {
    return cached
  }

  const directUrl = `local-media://localhost?path=${encodeURIComponent(filePath)}`
  const normalized = filePath.replace(/\\/g, '/')
  const rawFileName = normalized.split('/').pop() || 'Audio Track'

  let parsed: ParsedAudioMetadata | null = null
  let albumArtUrl: string | null = null

  try {
    // Read the first 1MB of the audio file over local-media:// for ID3/Vorbis headers and embedded artwork
    const resp = await fetch(directUrl, {
      headers: { Range: 'bytes=0-1048575' },
    })
    if (resp.ok || resp.status === 206) {
      const blob = await resp.blob()
      parsed = await parseAudioFileMetadata(blob, rawFileName)
      if (parsed.albumArtBlob) {
        albumArtUrl = URL.createObjectURL(parsed.albumArtBlob)
      }
    }
  } catch (err) {
    console.warn('[local-media] Could not read audio headers for', filePath, err)
  }

  // If no embedded artwork, check for directory cover image (e.g. cover.jpg, folder.jpg)
  if (!albumArtUrl && folderCoverPath) {
    albumArtUrl = `local-media://localhost?path=${encodeURIComponent(folderCoverPath)}`
  }

  // If still no artwork, attempt fast online lookup via iTunes
  if (!albumArtUrl && parsed && (parsed.artist || parsed.title)) {
    try {
      const onlineArt = await fetchOnlineAlbumArt(parsed.artist, parsed.albumName || parsed.title)
      if (onlineArt) {
        albumArtUrl = onlineArt
      }
    } catch {
      // Ignore online art errors
    }
  }

  const result = buildLocalAudioTrack(filePath, {
    title: parsed?.title,
    artist: parsed?.artist,
    albumName: parsed?.albumName,
    trackNumber: parsed?.trackNumber ?? undefined,
    durationMs: parsed?.durationMs,
    albumArtUrl,
  })

  localTrackCache.set(filePath, result)
  return result
}

/**
 * Resolves a full local playlist from the directory containing the requested file.
 * Automatically discovers sibling tracks and directory artwork, immediately pre-enriches
 * the current, next, and previous tracks, and enriches remaining songs in the background.
 */
export async function resolveLocalAudioPlaylist(
  filePath: string,
  onTrackEnriched?: (track: LocalTrackInfo, index: number) => void,
): Promise<{ tracks: LocalTrackInfo[]; initialIndex: number }> {
  const api = getDesktopAPI()
  let fileList = [filePath]
  let folderCoverPath: string | null = null

  if (api?.getFolderTracks) {
    try {
      const res = await api.getFolderTracks(filePath)
      if (res.tracks && res.tracks.length > 0) {
        fileList = res.tracks
      }
      folderCoverPath = res.folderCoverPath || null
    } catch (err) {
      console.warn('[local-media] Error fetching folder tracks:', err)
    }
  }

  // Normalize paths for comparison
  const normalizedTarget = filePath.replace(/\\/g, '/').toLowerCase()
  let initialIndex = 0

  // Build the tracks list with cached or preliminary data
  const tracks: LocalTrackInfo[] = []
  for (let i = 0; i < fileList.length; i++) {
    const p = fileList[i]
    if (p.replace(/\\/g, '/').toLowerCase() === normalizedTarget) {
      initialIndex = i
    }
    const cached = localTrackCache.get(p)
    if (cached) {
      tracks.push(cached)
    } else {
      tracks.push(
        buildLocalAudioTrack(p, {
          albumArtUrl: folderCoverPath
            ? `local-media://localhost?path=${encodeURIComponent(folderCoverPath)}`
            : null,
        }),
      )
    }
  }

  // 1. Enrich the targeted track first so it starts playing with full metadata
  try {
    const enrichedTarget = await resolveLocalAudioTrack(filePath, folderCoverPath)
    tracks[initialIndex] = enrichedTarget
    onTrackEnriched?.(enrichedTarget, initialIndex)
  } catch (err) {
    console.warn('[local-media] Error enriching target track:', err)
  }

  // 2. Pre-enrich immediate next and previous tracks so pressing "Next" or "Prev" is instantaneous
  const priorityIndices = [initialIndex + 1, initialIndex - 1].filter(
    (idx) => idx >= 0 && idx < fileList.length && !localTrackCache.has(fileList[idx]),
  )
  for (const idx of priorityIndices) {
    try {
      const enriched = await resolveLocalAudioTrack(fileList[idx], folderCoverPath)
      tracks[idx] = enriched
      onTrackEnriched?.(enriched, idx)
    } catch {
      // Continue
    }
  }

  // 3. Concurrently background-enrich all remaining tracks in the queue
  void (async () => {
    for (let i = 0; i < fileList.length; i++) {
      if (i === initialIndex || priorityIndices.includes(i)) continue
      if (localTrackCache.has(fileList[i])) continue
      try {
        const enriched = await resolveLocalAudioTrack(fileList[i], folderCoverPath)
        tracks[i] = enriched
        onTrackEnriched?.(enriched, i)
      } catch {
        // Keep preliminary track on failure
      }
    }
  })()

  return { tracks, initialIndex }
}
