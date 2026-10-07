export const normalizeUploadedUrl = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (/^https?:\/\/(api|otix-api)(:\d+)?(\/.*)?$/i.test(rawUrl)) {
    return origin ? rawUrl.replace(/^https?:\/\/(api|otix-api)(:\d+)?/i, origin) : rawUrl
  }
  if (rawUrl.startsWith('/') && origin) {
    return `${origin}${rawUrl}`
  }
  return rawUrl
}
