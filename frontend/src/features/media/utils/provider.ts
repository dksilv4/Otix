import { API_BASE_URL } from '@/lib/config'

export const resolveProviderUrl = (url?: string | null): string | null => {
  if (!url) return null
  if (url.startsWith('/api/')) {
    const base = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL.slice(0, -7) : API_BASE_URL
    return `${base}${url}`
  }
  return url
}
