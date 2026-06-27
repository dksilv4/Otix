// ponytail: typed API client using openapi-fetch + generated openapi-typescript schemas.
// Use alongside the existing axios apiClient for incremental migration.
//
// Usage:
//   import { api } from '@/lib/api/typed-client'
//   const { data, error } = await api.GET('/api/auth/me')
//   // data is fully typed: MeResponse | undefined

import createClient from 'openapi-fetch'
import type { paths } from '@/api-types'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'
import { isDesktop } from '@/lib/desktop'

const BASE_URL = isDesktop()
  ? (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
  : (import.meta.env.VITE_API_BASE_URL || '')

export const api = createClient<paths>({
  baseUrl: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
})

// Auth token injection + 401 refresh
api.use({
  async onRequest({ request }) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  async onResponse({ response }) {
    if (response.status === 401) {
      const currentToken = localStorage.getItem(ACCESS_TOKEN_KEY)
      if (currentToken) {
        try {
          const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
          })
          if (refreshRes.ok) {
            const data = await refreshRes.json()
            const newToken = data.access_token || data.accessToken
            if (newToken) {
              localStorage.setItem(ACCESS_TOKEN_KEY, newToken)
              return undefined // caller should retry
            }
          }
        } catch { /* refresh failed */ }
      }
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.dispatchEvent(new CustomEvent('auth:sessionExpired'))
    }
    return response
  },
})
