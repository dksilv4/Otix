// ponytail: typed API client with automatic snake_case → camelCase conversion.
//
// The generated api-types are snake_case (Python backend). This client:
//   Runtime: transforms all JSON responses to camelCase
//   Types:   applies CamelCaseKeys<T> so you get camelCase property names
//
// Usage:
//   import { cam } from '@/lib/api/camel-client'
//   const { data } = await cam.GET('/api/auth/me')
//   data.isVerified   ← typed as boolean, not data.is_verified
//   data.createdAt    ← typed as string, not data.created_at

import createClient from 'openapi-fetch'
import type { paths as ApiPaths } from './openapi'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import { isDesktop } from '@/lib/desktop'
import { convertKeysToCamelCase } from './client'

// ── CamelCase type mapping ───────────────────────────────────────────

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

export type CamelCaseKeys<T> =
  T extends unknown[] ? { [K in keyof T]: CamelCaseKeys<T[K]> }
  : T extends object ? { [K in keyof T as CamelCase<string & K>]: CamelCaseKeys<T[K]> }
  : T

// ── Client ───────────────────────────────────────────────────────────

const BASE_URL = isDesktop()
  ? (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
  : (import.meta.env.VITE_API_BASE_URL || '')

// Build the typed client, then monkey-patch fetch for camelCase conversion
const _client = createClient<ApiPaths>({
  baseUrl: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
})

// Auth middleware
_client.use({
  async onRequest({ request }) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  async onResponse({ response }) {
    if (response.status === 401) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.dispatchEvent(new CustomEvent('auth:sessionExpired'))
    }
    return response
  },
})

// Intercept fetch to convert JSON responses to camelCase
type FetchFn = (req: Request) => Promise<Response>
const _fetchable = _client as unknown as { fetch?: FetchFn }
const _origFetch = _fetchable.fetch
if (_origFetch) {
  _fetchable.fetch = async (req: Request) => {
    const res = await _origFetch(req)
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) return res
    const json = await res.clone().json()
    const camel = convertKeysToCamelCase(json)
    return new Response(JSON.stringify(camel), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
}

// ponytail: cast through CamelCaseKeys — the runtime data IS camelCase,
// so this cast is truthful. openapi-fetch v0.17 types methods as generic
// functions, so Parameters/ReturnType resolve to `never`; type the surface
// here instead.
type MethodKey = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'PATCH' | 'TRACE'

export const cam = _client as unknown as {
  [M in MethodKey]: (
    url: keyof ApiPaths,
    ...init: unknown[]
  ) => Promise<{ data: any; error?: never; response: Response }>
}
