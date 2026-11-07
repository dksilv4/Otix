// TODO: Review this file
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ACCESS_TOKEN_KEY, API_BASE_URL, resolveApiBaseUrl } from '@/lib/config/config'
import { isDesktop } from '@/lib/desktop/api'
import { getInitialTheme, resolveTheme } from '@/lib/theme/theme-utils'
import { refreshAccessToken } from './session-refresh'

export const CLIENT_API_BASE_URL = API_BASE_URL
const BASE_URL = CLIENT_API_BASE_URL

// ── Case conversion utilities ────────────────────────────────────────

const camelCache = new Map<string, string>()
const snakeCache = new Map<string, string>()

function toCamel(s: string): string {
  let cached = camelCache.get(s)
  if (cached !== undefined) return cached
  if (!s.includes('_') && !s.includes('-')) {
    camelCache.set(s, s)
    return s
  }
  cached = s.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace('-', '').replace('_', ''),
  )
  camelCache.set(s, cached)
  return cached
}

function toSnake(s: string): string {
  let cached = snakeCache.get(s)
  if (cached !== undefined) return cached
  if (!/[A-Z]/.test(s)) {
    snakeCache.set(s, s)
    return s
  }
  cached = s.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
  snakeCache.set(s, cached)
  return cached
}

function isObject(o: unknown): o is Record<string, unknown> {
  return o === Object(o) && !Array.isArray(o) && typeof o !== 'function'
}

export function convertKeysToCamelCase(o: unknown): unknown {
  if (isObject(o)) {
    const n: Record<string, unknown> = {}
    Object.keys(o).forEach((k) => {
      n[toCamel(k)] = convertKeysToCamelCase(o[k])
    })
    return n
  } else if (Array.isArray(o)) {
    return o.map((i) => convertKeysToCamelCase(i))
  }
  return o
}

function convertKeysToSnakeCase(o: unknown): unknown {
  if (isObject(o)) {
    const n: Record<string, unknown> = {}
    Object.keys(o).forEach((k) => {
      n[toSnake(k)] = convertKeysToSnakeCase(o[k])
    })
    return n
  } else if (Array.isArray(o)) {
    return o.map((i) => convertKeysToSnakeCase(i))
  }
  return o
}

function getContentType(headers: Record<string, unknown>): string {
  const ct = headers['content-type']
  return typeof ct === 'string' ? ct : ''
}

function readBearerToken(headers: InternalAxiosRequestConfig['headers'] | undefined): string | null {
  if (!headers) return null
  let raw: unknown
  if (typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (key: string) => unknown }).get('Authorization')
  } else {
    const rec = headers as Record<string, unknown>
    raw = rec.Authorization ?? rec.authorization
  }
  if (typeof raw !== 'string' || !raw) return null
  return raw.replace(/^Bearer\s+/i, '')
}

// Type-level counterpart of convertKeysToCamelCase — maps a snake_case API
// schema type to its camelCase runtime shape.
type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

export type CamelCaseKeys<T> =
  T extends unknown[] ? { [K in keyof T]: CamelCaseKeys<T[K]> }
  : T extends object ? { [K in keyof T as CamelCase<string & K>]: CamelCaseKeys<T[K]> }
  : T

// Refresh logic (single-flighted, shared across the app) lives in
// ./session-refresh.ts.

// ── Axios instance ────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // for httpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000, // 60s — grouped search cold path can take ~40s with embedding
})

// ── Request interceptor — camelCase → snake_case + auth token ─────────

// Viewer's resolved UI theme so the backend can pick logos that contrast with it.
export function getResolvedTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return resolveTheme(getInitialTheme())
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (isDesktop() || (typeof window !== 'undefined' && window.location.port === '5174')) {
    const activeBase = resolveApiBaseUrl()
    if (activeBase && config.baseURL !== activeBase) {
      config.baseURL = activeBase
    }
  }
  // Strip redundant /api/v1 prefix if a caller passed it directly (since baseURL already includes /api/v1)
  if (config.url?.startsWith('/api/v1/')) {
    config.url = config.url.replace(/^\/api\/v1/, '')
  }
  // Attach Bearer token
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.headers) {
    config.headers['X-Otix-Theme'] = getResolvedTheme()
  }

  // Convert outgoing data and params to snake_case
  if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    config.data = convertKeysToSnakeCase(config.data)
  }
  if (config.params) {
    config.params = convertKeysToSnakeCase(config.params)
  }

  // For FormData, delete Content-Type so the browser sets the correct multipart boundary.
  // Using delete is more reliable than set(_, undefined) across axios versions.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
    delete config.headers['content-type']
  }

  return config
})

// ── Response interceptor — snake_case → camelCase + 401 refresh ──────

apiClient.interceptors.response.use(
  (response) => {
    if (response.data && getContentType(response.headers).includes('application/json')) {
      response.data = convertKeysToCamelCase(response.data)
    }
    return response
  },
  async (error: AxiosError) => {
    // Transform error response data too
    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        const trimmed = error.response.data.trim()
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            error.response.data = JSON.parse(trimmed)
          } catch {
            // retain raw string
          }
        }
      }

      if (
        typeof error.response.data === 'object' &&
        error.response.data !== null
      ) {
        const data = convertKeysToCamelCase(error.response.data) as { detail?: unknown }
        error.response.data = data
        // Normalize FastAPI 422 validation errors: detail is an array of
        // {type, loc, msg, input} — flatten to a single string so React can render it.
        if (Array.isArray(data.detail)) {
          data.detail = data.detail
            .map((e: { loc?: string[]; msg?: string }) => {
              const field = e.loc ? e.loc[e.loc.length - 1] : ''
              return field ? `${field}: ${e.msg}` : e.msg
            })
            .join('; ')
        } else if (!data.detail && typeof data === 'object') {
          // Normalize Django REST Framework validation errors (e.g. { avatarUrl: ['...'] })
          const messages: string[] = []
          for (const [key, val] of Object.entries(data)) {
            if (Array.isArray(val)) {
              const list = val.filter((item): item is string => typeof item === 'string')
              if (list.length > 0) {
                messages.push(key === 'nonFieldErrors' ? list.join(', ') : `${key}: ${list.join(', ')}`)
              }
            } else if (typeof val === 'string') {
              messages.push(key === 'nonFieldErrors' ? val : `${key}: ${val}`)
            }
          }
          if (messages.length > 0) {
            data.detail = messages.join('; ')
          }
        }
      } else if (typeof error.response.data === 'string' && error.response.data) {
        error.response.data = { detail: error.response.data, error: error.response.data }
      }
    }

    // Token refresh flow — skip for endpoints that return 401 for reasons
    // other than an expired access token (login, register, refresh itself).
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
      _networkRetryCount?: number
    }
    const skipRefresh = ['/auth/login', '/auth/register', '/auth/refresh'].some(
      (path) => originalRequest?.url?.includes(path),
    )

    // Handle transient network errors & server startup connection refused for idempotent requests
    const method = originalRequest?.method?.toLowerCase() || ''
    const isIdempotent = method === 'get' || method === 'head' || method === 'options'
    const isNetworkError =
      !error.response ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ERR_CONNECTION_REFUSED' ||
      error.message?.includes('Network Error') ||
      [502, 503, 504].includes(error.response?.status || 0)

    const retryCount = originalRequest?._networkRetryCount || 0
    if (isIdempotent && isNetworkError && retryCount < 2 && !skipRefresh) {
      if (originalRequest) {
        originalRequest._networkRetryCount = retryCount + 1
      }
      const backoffMs = retryCount === 0 ? 250 : 600
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      return apiClient(originalRequest)
    }

    // Synthesize structured error response for pure network failures (e.g. ECONNREFUSED)
    if (!error.response && originalRequest) {
      const isRefused =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ERR_CONNECTION_REFUSED' ||
        /refused/i.test(error.message || '')
      const detailMsg = isRefused
        ? 'Connection refused: Otix backend service is offline or restarting.'
        : error.message || 'Network error: failed to communicate with Otix server.'
      error.response = {
        data: {
          detail: detailMsg,
          error: detailMsg,
          code: isRefused ? 'connection_refused' : 'network_error',
        },
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: originalRequest,
      } as any
    }

    if (error.response?.status !== 401 || originalRequest?._retry || skipRefresh) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    // A refresh may have already rotated the access token while this request
    // was in flight. Retry with the new token instead of rotating again —
    // a second /auth/refresh would replay the old cookie and revoke the session.
    const currentToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    // Anonymous 401s (e.g. /library/nodes on the public media page) must not
    // attempt refresh — a failed refresh fires auth:sessionExpired, which
    // queryClient.clear()s in-flight catalog fetches and leaves observers stuck.
    const isPublicGet =
      originalRequest.method?.toLowerCase() === 'get' &&
      ['/discover', '/media', '/search', '/freegames', '/lists'].some((p) => originalRequest.url?.includes(p))

    if (!currentToken) {
      if (isPublicGet && originalRequest.headers && (originalRequest.headers.Authorization || (originalRequest.headers as Record<string, unknown>).authorization)) {
        delete originalRequest.headers.Authorization
        delete (originalRequest.headers as Record<string, unknown>).authorization
        return apiClient(originalRequest)
      }
      return Promise.reject(error)
    }
    const sentToken = readBearerToken(originalRequest.headers)
    if (currentToken && sentToken && currentToken !== sentToken) {
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${currentToken}`
      }
      return apiClient(originalRequest)
    }

    // refreshAccessToken() single-flights concurrent callers and signs the user
    // out (auth:sessionExpired) only when the refresh itself fails.
    try {
      const token = await refreshAccessToken()
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${token}`
      }
      return apiClient(originalRequest)
    } catch (refreshError) {
      if (isPublicGet) {
        if (originalRequest.headers) {
          delete originalRequest.headers.Authorization
          delete (originalRequest.headers as Record<string, unknown>).authorization
        }
        return apiClient(originalRequest)
      }
      return Promise.reject(refreshError)
    }
  },
)
