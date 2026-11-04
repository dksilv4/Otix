// ponytail: single source of truth for desktop API configuration

function isDevMode(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.OTIX_DEV === '1' || process.env.OTIX_DEV === 'true') return true;
  if (process.argv?.some((arg) => arg === '--dev' || arg === '-dev' || arg === '--local-api')) return true;
  try {
    const { app } = require('electron');
    if (app && typeof app.isPackaged === 'boolean') {
      return !app.isPackaged;
    }
  } catch {}
  return false;
}

export function getApiBaseUrl(): string {
  if (process.env.OTIX_BACKEND_URL) return process.env.OTIX_BACKEND_URL;
  try {
    const { getSettings } = require('./desktop-settings');
    const settings = getSettings();
    if (settings?.apiBaseUrl) return settings.apiBaseUrl;
  } catch {}
  if (isDevMode()) return 'http://127.0.0.1:8000';
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
