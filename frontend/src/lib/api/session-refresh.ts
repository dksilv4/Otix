// Single-flighted access-token refresh shared by all API callers. Concurrent
// 401s collapse into one POST /auth/refresh — a second concurrent refresh would
// send a just-rotated refresh token, tripping the backend's reuse detection
// which revokes every session for the user.
import axios from 'axios'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import { CLIENT_API_BASE_URL } from './client'

let isRefreshing = false
let refreshFailed = false // cooldown — prevent a retry storm after a failed refresh
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

export function refreshAccessToken(): Promise<string> {
  if (refreshFailed) {
    return Promise.reject(new Error('Session expired'))
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
      refreshQueue.forEach(({ resolve }) => resolve(token))
      refreshQueue = []
      return token
    })
    .catch((error) => {
      refreshFailed = true
      refreshQueue.forEach(({ reject }) => reject(error))
      refreshQueue = []
      clearAuthSession()
      throw error
    })
    .finally(() => {
      isRefreshing = false
    })
}
