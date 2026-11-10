const MAX_BLOB_URLS = 300
const blobUrlCache = new Map<Blob, string>()
let activePlaybackUrl: string | null = null

export const setActivePlaybackUrl = (url: string | null): void => {
  activePlaybackUrl = url
}

/**
 * Retrieves a cached object URL for a Blob or creates and caches one.
 * Uses a true LRU cache bounded to MAX_BLOB_URLS.
 * Accessing an existing item refreshes its recency.
 * Evicting oldest items revokes the Object URL and deletes the mapping to prevent dead URLs.
 */
export const getOrCreateBlobUrl = (blob: Blob | null | undefined): string | null => {
  if (!blob) return null
  const cached = blobUrlCache.get(blob)
  if (cached) {
    // Refresh LRU recency: delete and re-insert at end of Map
    blobUrlCache.delete(blob)
    blobUrlCache.set(blob, cached)
    return cached
  }

  try {
    const url = URL.createObjectURL(blob)

    // Evict oldest item if cache limit reached (preserving active playback stream URL)
    if (blobUrlCache.size >= MAX_BLOB_URLS) {
      for (const [oldestBlob, oldestUrl] of blobUrlCache.entries()) {
        if (activePlaybackUrl && oldestUrl === activePlaybackUrl) {
          continue
        }
        blobUrlCache.delete(oldestBlob)
        try {
          URL.revokeObjectURL(oldestUrl)
        } catch {
          // Ignore revocation failure
        }
        break
      }
    }

    blobUrlCache.set(blob, url)
    return url
  } catch {
    return null
  }
}

/**
 * Clears and revokes all active Blob URLs in the cache, resetting all tracking.
 */
export const clearBlobUrlCache = (): void => {
  for (const url of blobUrlCache.values()) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignore
    }
  }
  blobUrlCache.clear()
}
