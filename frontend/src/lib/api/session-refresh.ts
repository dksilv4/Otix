// Single-flighted access-token refresh shared by all API callers. Concurrent
// 401s collapse into one POST /auth/refresh — a second concurrent refresh would
// send a just-rotated refresh token, tripping the backend's reuse detection
// which revokes every session for the user.
import axios from 'axios'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import { CLIENT_API_BASE_URL } from './client'

const REFRESH_GRACE_MS = 10_000

let isRefreshing = false
let refreshFailed = false // cooldown — prevent a retry storm after a failed refresh
let lastRefreshAt = 0
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

async function postRefresh(): Promise<string> {
  // Fresh axios instance: the shared client's own interceptor would otherwise
  // treat a refresh 401 as a session to re-refresh.
  const authClient = axios.create({
    baseURL: CLIENT_API_BASE_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  })
  const response = await authClient.post('/auth/refresh', {})
  const token = response.data.access_token ?? response.data.accessToken
  localStorage.setItem(ACCESS_TOKEN_KEY, token)
  return token
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.dispatchEvent(new CustomEvent('auth:sessionExpired'))
}

/** Call after a successful login/register so a prior failed refresh cannot stick. */
export function resetAuthRefreshState(): void {
  refreshFailed = false
  isRefreshing = false
  lastRefreshAt = 0
  refreshQueue = []
}

export function isAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { message?: string; response?: { status?: number } }
  if (err.message === 'Session expired') return true
  return err.response?.status === 401
}

export function refreshAccessToken(): Promise<string> {
  if (refreshFailed) {
    return Promise.reject(new Error('Session expired'))
  }

  const existing = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (existing && lastRefreshAt > 0 && Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
    return Promise.resolve(existing)
  }

  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      refreshQueue.push({ resolve, reject })
    })
  }

  isRefreshing = true
  return postRefresh()
    .then((token) => {
      refreshFailed = false
      lastRefreshAt = Date.now()
      refreshQueue.forEach(({ resolve }) => resolve(token))
      refreshQueue = []
      return token
    })
    .catch((error) => {
      refreshFailed = true
      lastRefreshAt = 0
      refreshQueue.forEach(({ reject }) => reject(error))
      refreshQueue = []
      clearAuthSession()
      throw error
    })
    .finally(() => {
      isRefreshing = false
    })
}
