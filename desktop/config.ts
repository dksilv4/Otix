// ponytail: single source of truth for desktop API configuration
export function getApiBaseUrl(): string {
  if (process.env.OTIX_BACKEND_URL) return process.env.OTIX_BACKEND_URL;
  return 'https://otix.app';
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl()
  return `${base}/api${path}`
}

// Versioned v1 base — the backend mounts routes under /api/v1, so callers that
// append a bare endpoint (e.g. plugin ctx.api) must use this, not getApiUrl('').
export function getApiV1Url(path: string): string {
  const base = getApiBaseUrl()
  return `${base}/api/v1${path}`
}
