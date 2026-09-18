
/**
 * Unified place for frontend configuration variables and environment flags.
 */

import { isDesktop } from '../desktop/api'

// Environment flags
export const IS_DEV = import.meta.env.DEV
export const IS_PROD = import.meta.env.PROD
export const IS_TEST = import.meta.env.TEST

function resolveApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  // Desktop talks to the API directly. The browser must stay same-origin
  // (`/api/v1`) so Vite / the reverse proxy handles it. Hitting
  // localhost:8000 from the page bypasses the proxy and fails with
  // TypeError: Failed to fetch (IPv6 localhost, CORS, unpublished port).
  if (isDesktop()) return 'http://127.0.0.1:8000/api/v1'
  return '/api/v1'
}

// API Configuration
export const API_BASE_URL = resolveApiBaseUrl()

// Local Storage Keys
export const ACCESS_TOKEN_KEY = 'otix-access-token'

export function hasAccessToken(): boolean {
  try {
    return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY))
  } catch {
    return false
  }
}
