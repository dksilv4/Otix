// TODO: Review this file
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { isDesktop } from '@/lib/desktop'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import { refreshAccessToken } from './session-refresh'

// ponytail: client needs different fallback logic than lib/config (desktop vs web)
export const CLIENT_API_BASE_URL = isDesktop()
  ? (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1')
  : (import.meta.env.VITE_API_BASE_URL || '/api/v1')
const BASE_URL = CLIENT_API_BASE_URL

// ── Case conversion utilities ────────────────────────────────────────

function toCamel(s: string): string {
  return s.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace('-', '').replace('_', ''),
  )
}

function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
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

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Attach Bearer token
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
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
    if (
      error.response?.data &&
      error.response.headers &&
      getContentType(error.response.headers as Record<string, unknown>).includes('application/json')
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
      }
    }

    // Token refresh flow — skip for endpoints that return 401 for reasons
    // other than an expired access token (login, register, refresh itself).
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const skipRefresh = ['/auth/login', '/auth/register', '/auth/refresh'].some(
      (path) => originalRequest?.url?.includes(path),
    )
    if (error.response?.status !== 401 || originalRequest?._retry || skipRefresh) {
      return Promise.reject(error)
    }

    // refreshAccessToken() single-flights concurrent callers and signs the user
    // out (auth:sessionExpired) only when the refresh itself fails.
    try {
      const token = await refreshAccessToken()
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${token}`
      }
      originalRequest._retry = true
      return apiClient(originalRequest)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)
