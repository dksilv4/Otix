const blobUrlCache = new WeakMap<Blob, string>()

/**
 * Retrieves a cached object URL for a Blob or creates and caches one.
 * Uses a WeakMap so that when the Blob is garbage-collected, the URL reference is cleanly removed.
 */
export const getOrCreateBlobUrl = (blob: Blob | null | undefined): string | null => {
  if (!blob) return null
  const cached = blobUrlCache.get(blob)
  if (cached) return cached
  try {
    const url = URL.createObjectURL(blob)
    blobUrlCache.set(blob, url)
    return url
  } catch {
    return null
  }
}
