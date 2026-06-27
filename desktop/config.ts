// ponytail: single source of truth for desktop API configuration
export function getApiBaseUrl(): string {
  return process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000'
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl()
  return `${base}/api${path}`
}
