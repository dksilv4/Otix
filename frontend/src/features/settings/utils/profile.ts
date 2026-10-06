export const normalizeUploadedUrl = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (/^https?:\/\/(api|otix-api)(:\d+)?(\/.*)?$/i.test(rawUrl)) {
    return rawUrl.replace(/^https?:\/\/(api|otix-api)(:\d+)?/i, origin)
  }
  if (rawUrl.startsWith('/')) {
    return `${origin}${rawUrl}`
  }
  return rawUrl
}
