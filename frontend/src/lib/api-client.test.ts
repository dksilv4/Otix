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
    const { apiClient } = await import('./api-client')
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
    const { apiClient } = await import('./api-client')
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
    const { apiClient } = await import('./api-client')
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
    const { apiClient } = await import('./api-client')
    const testAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      const err = new Error('Request failed with status code 422') as unknown as {
        response: { data: { detail: Array<{ loc: string[]; msg: string }> }; status: number; statusText: string; headers: Record<string, string> }
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
    const { apiClient } = await import('./api-client')
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

  it('handles token refresh failure', async () => {
    const { apiClient } = await import('./api-client')
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
})

