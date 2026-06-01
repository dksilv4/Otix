/**
 * Typed API client using openapi-fetch with generated types.
 *
 * Generate types first: npm run generate:types  (requires backend running on localhost:8000)
 * Then import from this module for type-safe API calls.
 *
 * Usage:
 *   import { typedApi } from '@/lib/typed-api-client'
 *   const { data, error } = await typedApi.GET('/api/auth/me')
 */

import createClient from 'openapi-fetch'
import type { paths } from '../api-types'

const ACCESS_TOKEN_KEY = 'otix-access-token'

export const typedApi = createClient<paths>({
  baseUrl: '/api',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Auto-attach auth token to every request
typedApi.use({
  async onRequest({ request }) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  async onResponse({ response }) {
    // Token refresh on 401 — delegates to the existing axios apiClient flow
    if (response.status === 401 && !response.url.includes('/auth/')) {
      const { apiClient } = await import('./api-client')
      try {
        const refreshRes = await apiClient.post('/auth/refresh', {})
        const newToken = refreshRes.data.access_token ?? refreshRes.data.accessToken
        localStorage.setItem(ACCESS_TOKEN_KEY, newToken)
      } catch {
        window.dispatchEvent(new CustomEvent('auth:sessionExpired'))
        throw new Error('Session expired')
      }
    }
    return response
  },
})
