export const normalizeUploadedUrl = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (/^https?:\/\/(api|otix-api)(:\d+)?(\/.*)?$/i.test(rawUrl)) {
    return origin ? rawUrl.replace(/^https?:\/\/(api|otix-api)(:\d+)?/i, origin) : rawUrl
  }
  if (rawUrl.startsWith('/') && origin) {
    return `${origin}${rawUrl}`
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && rawUrl.startsWith('http://')) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.host === window.location.host || rawUrl.includes('/uploads/')) {
        parsed.protocol = 'https:'
        return parsed.toString()
      }
    } catch {
      // ignore invalid URLs
    }
  }
  return rawUrl
}
