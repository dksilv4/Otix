/**
 * Unified place for frontend configuration variables and environment flags.
 */

import { isDesktop, getDesktopAPI } from '../desktop/api'

// Environment flags
export const IS_DEV = Boolean(import.meta.env?.DEV)
export const IS_PROD = Boolean(import.meta.env?.PROD)
export const IS_TEST = Boolean(import.meta.env?.TEST)

export function resolveApiBaseUrl(): string {
  if (import.meta.env?.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  const isPort5174 = typeof window !== 'undefined' && window.location.port === '5174'
  // Desktop talks to the API directly.
  // In development, desktop connects to the local dev backend.
  // In production (packaged release app), desktop connects to the production API.
  if (isDesktop() || isPort5174) {
    const desktopBase = getDesktopAPI()?.apiBaseUrl || (typeof getDesktopAPI()?.getApiBaseUrl === 'function' ? getDesktopAPI()?.getApiBaseUrl?.() : undefined)
    if (desktopBase) {
      return `${desktopBase.replace(/\/+$/, '')}/api/v1`
    }
    if (import.meta.env?.DEV || import.meta.env?.VITE_LOCAL_BACKEND === 'true' || isPort5174) {
      return 'http://127.0.0.1:8000/api/v1'
    }
    return 'https://otix.app/api/v1'
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
