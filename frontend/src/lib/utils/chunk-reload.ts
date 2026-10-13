export const isChunkLoadError = (err: unknown): boolean => {
  if (!err) return false
  const msg = String((err as { message?: string })?.message || err)
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS')
  )
}

export const reloadForNewChunk = (): boolean => {
  if (typeof window === 'undefined') return false
  const key = 'otix_chunk_reload_ts'
  const last = sessionStorage.getItem(key)
  const now = Date.now()
  // 10-second debounce to avoid infinite reload loop if truly broken
  if (!last || now - parseInt(last, 10) > 10000) {
    sessionStorage.setItem(key, String(now))
    window.location.reload()
    return true
  }
  return false
}
