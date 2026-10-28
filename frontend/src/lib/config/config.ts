
/**
 * Unified place for frontend configuration variables and environment flags.
 */

import { isDesktop } from '../desktop/api'

// Environment flags
export const IS_DEV = Boolean(import.meta.env?.DEV)
export const IS_PROD = Boolean(import.meta.env?.PROD)
export const IS_TEST = Boolean(import.meta.env?.TEST)

function resolveApiBaseUrl(): string {
  if (import.meta.env?.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  // Desktop talks to the API directly.
  // In development, desktop connects to the local dev backend.
  // In production (packaged release app), desktop connects to the production API.
  if (isDesktop()) {
    return import.meta.env?.DEV ? 'http://127.0.0.1:8000/api/v1' : 'https://otix.app/api/v1'
  }
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
