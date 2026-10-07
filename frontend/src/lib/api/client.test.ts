// TODO: Review this file
import axios from 'axios'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (
  config: InternalAxiosRequestConfig,
  data: unknown,
): AxiosResponse => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  config,
})

describe('apiClient', () => {
  afterEach(() => {
    vi.resetModules()
    localStorage.clear()
    axios.defaults.adapter = undefined
  })

  it('adds bearer tokens and converts request and response keys', async () => {
    const { apiClient } = await import('./client')
    const seenConfigs: InternalAxiosRequestConfig[] = []
    const adapter: AxiosAdapter = async (config) => {
      seenConfigs.push(config)
      return jsonResponse(config, {
        media_id: 'm1',
        nested_items: [{ release_date: '2026-05-09' }],
      })
    }
    apiClient.defaults.adapter = adapter
    axios.defaults.adapter = adapter
    localStorage.setItem('otix-access-token', 'access-123')

    const response = await apiClient.post(
      '/media',
      { mediaId: 'm1', nestedItems: [{ releaseDate: '2026-05-09' }] },
      { params: { sortBy: 'releaseDate' } },
    )

    expect(seenConfigs[0].headers.Authorization).toBe('Bearer access-123')
    expect(JSON.parse(seenConfigs[0].data as string)).toEqual({
      media_id: 'm1',
      nested_items: [{ release_date: '2026-05-09' }],
    })
    expect(seenConfigs[0].params).toEqual({ sort_by: 'releaseDate' })
    expect(response.data).toEqual({
      mediaId: 'm1',
      nestedItems: [{ releaseDate: '2026-05-09' }],
    })
  })

  it('leaves FormData payloads untouched and lets the browser set multipart headers', async () => {
    const { apiClient } = await import('./client')
    const form = new FormData()
    form.append('avatar', new Blob(['x']), 'avatar.txt')
    let seenConfig: InternalAxiosRequestConfig | undefined
    const testAdapter = async (config: InternalAxiosRequestConfig) => {
      seenConfig = config
      return jsonResponse(config, { ok: true })
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    await apiClient.post('/upload', form)

    expect(seenConfig?.data).toBe(form)
    expect(seenConfig?.headers['Content-Type']).not.toBe('application/json')
  })

  it('does not camelize non-json response payloads', async () => {
    const { apiClient } = await import('./client')
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => ({
      data: { still_snake: true },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      config,
    })
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    const response = await apiClient.get('/plain')

    expect(response.data).toEqual({ still_snake: true })
  })

  it('normalizes FastAPI 422 validation errors in error response', async () => {
    const { apiClient } = await import('./client')
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      const err = new Error('Request failed with status code 422') as unknown as {
        response: { data: { detail: Array<{ loc: string[]; msg: string }> }; status: number; statusText: string; headers: Record<string, string>; config: InternalAxiosRequestConfig }
        config: InternalAxiosRequestConfig
      }
      err.response = {
        data: {
          detail: [
            { loc: ['body', 'password'], msg: 'field required' },
            { loc: ['body', 'username'], msg: 'too short' }
          ]
        },
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: { 'content-type': 'application/json' },
        config,
      }
      err.config = config
      throw err
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    await expect(apiClient.post('/validation')).rejects.toThrowError()
    try {
      await apiClient.post('/validation')
    } catch (e: unknown) {
      expect((e as { response: { data: { detail: string } } }).response.data.detail).toBe('password: field required; username: too short')
    }
  })

  it('triggers token refresh flow on 401 error', async () => {
    const { apiClient } = await import('./client')
    localStorage.setItem('otix-access-token', 'expired-token')
    let requestCount = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      requestCount++
      if (config.url?.includes('/auth/refresh')) {
        return jsonResponse(config, { access_token: 'new-token-999' })
      }
      if (requestCount === 1) {
        const err = new Error('Unauthorized') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Unauthorized',
          config,
        }
        err.config = config
        throw err
      }
      return jsonResponse(config, { success: true })
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    const res = await apiClient.get('/some-secure-data')
    expect(res.data).toEqual({ success: true })
    expect(localStorage.getItem('otix-access-token')).toBe('new-token-999')
  })

  it('does not refresh or expire the session when a 401 arrives with no access token', async () => {
    const { apiClient } = await import('./client')
    let sessionExpiredDispatched = false
    window.addEventListener('auth:sessionExpired', () => {
      sessionExpiredDispatched = true
    })

    let refreshCalls = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      if (config.url?.includes('/auth/refresh')) {
        refreshCalls++
        const err = new Error('Refresh failed') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'No refresh token provided',
          config,
        }
        err.config = config
        throw err
      }
      const err = new Error('Unauthorized') as unknown as {
        response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
        config: InternalAxiosRequestConfig
      }
      err.response = {
        status: 401,
        headers: {},
        data: 'Authentication credentials were not provided.',
        config,
      }
      err.config = config
      throw err
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    await expect(apiClient.get('/library/servers')).rejects.toMatchObject({ response: { status: 401 } })
    expect(refreshCalls).toBe(0)
    expect(sessionExpiredDispatched).toBe(false)
  })

  it('handles token refresh failure', async () => {
    const { apiClient } = await import('./client')
    localStorage.setItem('otix-access-token', 'expired-token')
    let sessionExpiredDispatched = false
    window.addEventListener('auth:sessionExpired', () => {
      sessionExpiredDispatched = true
    })

    let requestCount = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      requestCount++
      if (config.url?.includes('/auth/refresh')) {
        const err = new Error('Refresh failed') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Refresh token expired',
          config,
        }
        err.config = config
        throw err
      }
      if (requestCount === 1) {
        const err = new Error('Unauthorized') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Unauthorized',
          config,
        }
        err.config = config
        throw err
      }
      return jsonResponse(config, { success: true })
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    await expect(apiClient.get('/secure-page')).rejects.toThrow()
    expect(sessionExpiredDispatched).toBe(true)
  })

  it('retries a 401 with a newer access token without calling refresh', async () => {
    const { apiClient } = await import('./client')
    localStorage.setItem('otix-access-token', 'old-token')
    let refreshCalls = 0
    let requestCount = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      if (config.url?.includes('/auth/refresh')) {
        refreshCalls++
        return jsonResponse(config, { access_token: 'from-refresh' })
      }
      requestCount++
      if (requestCount === 1) {
        localStorage.setItem('otix-access-token', 'already-rotated-token')
        const err = new Error('Unauthorized') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Unauthorized',
          config,
        }
        err.config = config
        throw err
      }
      return jsonResponse(config, { success: true })
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    const res = await apiClient.get('/late-inflight')
    expect(res.data).toEqual({ success: true })
    expect(refreshCalls).toBe(0)
    expect(requestCount).toBe(2)
  })

  it('single-flights concurrent 401s into one refresh', async () => {
    const { apiClient } = await import('./client')
    localStorage.setItem('otix-access-token', 'old-token')
    let refreshCalls = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      if (config.url?.includes('/auth/refresh')) {
        refreshCalls++
        return jsonResponse(config, { access_token: 'new-token-999' })
      }
      const auth = String(config.headers?.Authorization ?? '')
      if (auth === 'Bearer old-token') {
        const err = new Error('Unauthorized') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Unauthorized',
          config,
        }
        err.config = config
        throw err
      }
      return jsonResponse(config, { ok: true })
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    const [a, b] = await Promise.all([
      apiClient.get('/one'),
      apiClient.get('/two'),
    ])
    expect(a.data).toEqual({ ok: true })
    expect(b.data).toEqual({ ok: true })
    expect(refreshCalls).toBe(1)
  })

  it('does not retry refresh after a failure until auth state is reset', async () => {
    const { apiClient } = await import('./client')
    const { resetAuthRefreshState } = await import('./session-refresh')
    localStorage.setItem('otix-access-token', 'old-token')
    let refreshCalls = 0
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      if (config.url?.includes('/auth/refresh')) {
        refreshCalls++
        const err = new Error('Refresh failed') as unknown as {
          response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
          config: InternalAxiosRequestConfig
        }
        err.response = {
          status: 401,
          headers: {},
          data: 'Refresh token expired',
          config,
        }
        err.config = config
        throw err
      }
      const err = new Error('Unauthorized') as unknown as {
        response: { status: number; headers: Record<string, string>; data: string; config: InternalAxiosRequestConfig }
        config: InternalAxiosRequestConfig
      }
      err.response = {
        status: 401,
        headers: {},
        data: 'Unauthorized',
        config,
      }
      err.config = config
      throw err
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    await expect(apiClient.get('/first')).rejects.toThrow()
    expect(refreshCalls).toBe(1)
    await expect(apiClient.get('/second')).rejects.toMatchObject({ response: { status: 401 } })
    expect(refreshCalls).toBe(1)

    resetAuthRefreshState()
    localStorage.setItem('otix-access-token', 'old-token')
    await expect(apiClient.get('/third')).rejects.toThrow()
    expect(refreshCalls).toBe(2)
  })

  it('normalizes Django REST Framework validation errors into detail string', async () => {
    const { apiClient } = await import('./client')
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      const err = new Error('Request failed with status code 400') as unknown as {
        response: {
          data: { avatar_url?: string[]; non_field_errors?: string[] }
          status: number
          statusText: string
          headers: Record<string, string>
          config: InternalAxiosRequestConfig
        }
        config: InternalAxiosRequestConfig
      }
      err.response = {
        data: {
          avatar_url: ['Disallowed URL scheme in avatar_url.'],
          non_field_errors: ['Invalid credentials.'],
        },
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
        config,
      }
      err.config = config
      throw err
    }
    apiClient.defaults.adapter = testAdapter
    axios.defaults.adapter = testAdapter

    try {
      await apiClient.patch('/auth/me', { avatarUrl: 'javascript:alert(1)' })
      expect.unreachable('Should have failed')
    } catch (e: unknown) {
      const detail = (e as { response: { data: { detail: string } } }).response.data.detail
      expect(detail).toContain('avatarUrl: Disallowed URL scheme in avatar_url.')
      expect(detail).toContain('Invalid credentials.')
    }
  })
})

