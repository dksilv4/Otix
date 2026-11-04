import { apiClient } from '@/lib/api/client'

export const MANIFEST_CHUNK_SIZE = 500

export interface ManifestFileEntry {
  filename: string
  filepath: string
  relative_path: string
  game_title: string
  format_category: string
  otix_media_id?: string | number
  otix_title?: string
  otix_confidence?: number
  [key: string]: any
}

export interface UploadManifestOptions {
  chunkSize?: number
  onProgress?: (uploadedCount: number, totalCount: number) => void
}

/**
 * Transforms an array of scanned game objects into uniform manifest file records.
 */
export const toManifestFiles = (scanned: any[]): ManifestFileEntry[] => {
  if (!Array.isArray(scanned)) return []
  return scanned.map((g: any) => ({
    filename: g.title || '',
    filepath: g.exePath || g.installDir || '',
    relative_path: g.installDir ? g.installDir.replace(/^[a-zA-Z]:[/\\]/, '') : (g.title || ''),
    game_title: g.title || '',
    format_category: g.platform === 'iso' ? 'iso' : 'game',
    otix_media_id: g.otixMediaId,
    otix_title: g.otixMediaTitle,
    otix_confidence: g.otixConfidence,
  }))
}

/**
 * Uploads a list of manifest files in bounded chunks (default 500 items per request).
 * This prevents HTTP 413 (Payload Too Large), socket disconnects, and browser thread freezing
 * during JSON serialization when scanning libraries with 2,000+ games.
 */
export const uploadNodeManifestInChunks = async (
  nodeId: string | number,
  files: any[],
  options?: UploadManifestOptions,
): Promise<void> => {
  if (!Array.isArray(files) || files.length === 0) return

  const chunkSize = options?.chunkSize && options.chunkSize > 0 ? options.chunkSize : MANIFEST_CHUNK_SIZE
  const isMultiChunk = files.length > chunkSize

  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize)
    const isFirst = i === 0

    const payload: { files: any[]; append?: boolean } = {
      files: chunk,
    }

    if (isMultiChunk && !isFirst) {
      payload.append = true
    }

    await apiClient.post(`/library/nodes/${nodeId}/manifest`, payload)
    options?.onProgress?.(Math.min(i + chunk.length, files.length), files.length)

    // Yield control briefly to the event loop so the UI remains smooth between chunks
    if (isMultiChunk && i + chunkSize < files.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
}

/**
 * Convenience helper to map scanned games and upload them in chunks to a node manifest.
 */
export const uploadScannedGamesManifest = async (
  nodeId: string | number,
  scanned: any[],
  options?: UploadManifestOptions,
): Promise<void> => {
  const manifestFiles = toManifestFiles(scanned)
  await uploadNodeManifestInChunks(nodeId, manifestFiles, options)
}
