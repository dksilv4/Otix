import type { LocalTrackInfo } from '@/lib/player/types'
import { getOrCreateBlobUrl } from '@/features/music/utils/blob-url-cache'
import { parseAudioFileMetadata } from './id3-parser'
import type { StoredLocalTrack } from './local-music-db'

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'opus',
  'wma',
  'alac',
  'aiff',
  'aif',
  'weba',
  'm4b',
])

export const isAudioFile = (fileName: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ext ? AUDIO_EXTENSIONS.has(ext) : false
}

export const scanDirectoryHandle = async (
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
  signal?: AbortSignal,
): Promise<{ file: File; path: string }[]> => {
  const results: { file: File; path: string }[] = []

  let lastProgressTime = 0
  const THROTTLE_MS = 100
  const reportProgress = (count: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastProgressTime >= THROTTLE_MS) {
      lastProgressTime = now
      onProgress?.(count)
    }
  }

  const isRestrictedFolderName = (name: string): boolean => {
    const lower = name.toLowerCase()
    return (
      name.startsWith('.') ||
      name.startsWith('$') ||
      name === 'node_modules' ||
      lower === 'system volume information' ||
      lower === '$recycle.bin' ||
      lower === 'recovery'
    )
  }

  const walk = async (handle: FileSystemDirectoryHandle, currentPath: string) => {
    if (signal?.aborted) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const entry of (handle as any).values()) {
        if (signal?.aborted) return
        if (entry.kind === 'file') {
          if (isAudioFile(entry.name)) {
            try {
              const file = await entry.getFile()
              if (signal?.aborted) return
              results.push({ file, path: `${currentPath}/${entry.name}` })
              reportProgress(results.length)
            } catch (e) {
              console.warn('[local-scanner] Could not read file:', entry.name, e)
            }
          }
        } else if (entry.kind === 'directory') {
          // Skip hidden, system, or restricted folders
          if (!isRestrictedFolderName(entry.name)) {
            try {
              await walk(entry, `${currentPath}/${entry.name}`)
            } catch (err) {
              console.warn('[local-scanner] Skipped restricted directory:', entry.name, err)
            }
          }
        }
      }
    } catch (err) {
      console.warn('[local-scanner] Skipped unreadable folder entries:', currentPath, err)
    }
  }

  await walk(dirHandle, dirHandle.name)
  // Ensure the final count is reported once traversal completes
  onProgress?.(results.length)
  return results
}

export interface ProcessAudioFilesOptions {
  concurrency?: number
  onProgress?: (current: number, total: number) => void
  onTrackParsed?: (track: StoredLocalTrack, file: File) => void
  signal?: AbortSignal
  existingTracksCache?: Map<string, StoredLocalTrack>
}

export const processAudioFiles = async (
  items: { file: File; path: string }[],
  folderName: string,
  onProgressOrOptions?: ((current: number, total: number) => void) | ProcessAudioFilesOptions,
  onTrackParsedCallback?: (track: StoredLocalTrack, file: File) => void,
): Promise<{ stored: StoredLocalTrack[]; liveMap: Map<string, File> }> => {
  let onProgress: ((current: number, total: number) => void) | undefined
  let onTrackParsed: ((track: StoredLocalTrack, file: File) => void) | undefined
  let signal: AbortSignal | undefined
  let existingTracksCache: Map<string, StoredLocalTrack> | undefined
  let concurrency = 3

  if (typeof onProgressOrOptions === 'function') {
    onProgress = onProgressOrOptions
    onTrackParsed = onTrackParsedCallback
  } else if (onProgressOrOptions) {
    onProgress = onProgressOrOptions.onProgress
    onTrackParsed = onProgressOrOptions.onTrackParsed ?? onTrackParsedCallback
    signal = onProgressOrOptions.signal
    existingTracksCache = onProgressOrOptions.existingTracksCache
    if (onProgressOrOptions.concurrency && onProgressOrOptions.concurrency > 0) {
      concurrency = onProgressOrOptions.concurrency
    }
  }

  const stored: StoredLocalTrack[] = []
  const liveMap = new Map<string, File>()
  const total = items.length
  if (total === 0) return { stored, liveMap }

  let currentIndex = 0
  let completedCount = 0

  const parseOne = async (item: { file: File; path: string }) => {
    if (signal?.aborted) return
    const { file, path } = item
    const trackId = `loc-${encodeURIComponent(item.path)}-${file.size}-${file.lastModified}`

    // VLC-inspired Delta Scanning: If track is already indexed with identical size and mtime,
    // reuse cached metadata immediately, bypassing heavy binary parsing and image blob decoding.
    const cached = existingTracksCache?.get(trackId)
    if (cached) {
      stored.push(cached)
      liveMap.set(trackId, file)
      onTrackParsed?.(cached, file)
      completedCount++
      onProgress?.(completedCount, total)
      return
    }

    try {
      const meta = await parseAudioFileMetadata(file)
      if (signal?.aborted) return

      let artBlob: Blob | null = meta.albumArtBlob ?? null
      if (!artBlob && meta.albumArt && meta.albumArt.startsWith('blob:')) {
        try {
          const resp = await fetch(meta.albumArt)
          artBlob = await resp.blob()
        } catch {
          // Ignore blob fetch failure
        }
      }

      const storedTrack: StoredLocalTrack = {
        id: trackId,
        title: meta.title,
        artist: meta.artist,
        albumName: meta.albumName,
        trackNumber: meta.trackNumber,
        year: meta.year,
        durationMs: meta.durationMs,
        albumArtBlob: artBlob,
        path,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
        folderName,
      }

      stored.push(storedTrack)
      liveMap.set(trackId, file)
      onTrackParsed?.(storedTrack, file)
    } catch (err) {
      console.warn('[local-scanner] Failed processing file:', file.name, err)
    } finally {
      completedCount++
      onProgress?.(completedCount, total)
    }
  }

  // Process files concurrently with a worker pool for fast, continuous real-time throughput
  const poolSize = Math.min(concurrency, total)
  const workers = Array.from({ length: poolSize }, async () => {
    while (currentIndex < total && !signal?.aborted) {
      const idx = currentIndex++
      await parseOne(items[idx])
    }
  })

  await Promise.all(workers)

  return { stored, liveMap }
}

export const buildLocalTrackInfo = (
  stored: StoredLocalTrack,
  file?: File,
  fallbackUrl?: string,
): LocalTrackInfo => {
  let playUrl = fallbackUrl || ''
  if (file) {
    playUrl = getOrCreateBlobUrl(file) || fallbackUrl || ''
  }

  let albumArtUrl: string | null = null
  if (stored.albumArtBlob) {
    albumArtUrl = getOrCreateBlobUrl(stored.albumArtBlob)
  }

  return {
    id: stored.id,
    file,
    url: playUrl,
    title: stored.title,
    artist: stored.artist,
    albumName: stored.albumName,
    albumArt: albumArtUrl,
    durationMs: stored.durationMs,
    trackNumber: stored.trackNumber ?? undefined,
    path: stored.path,
  }
}
