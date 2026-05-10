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
    apiClient.defaults.adapter = async (config) => {
      seenConfig = config
      return jsonResponse(config, { ok: true })
    }

    await apiClient.post('/upload', form)

    expect(seenConfig?.data).toBe(form)
    expect(seenConfig?.headers['Content-Type']).not.toBe('application/json')
  })

  it('does not camelize non-json response payloads', async () => {
    const { apiClient } = await import('./api-client')
    apiClient.defaults.adapter = async (config) => ({
      data: { still_snake: true },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      config,
    })

    const response = await apiClient.get('/plain')

    expect(response.data).toEqual({ still_snake: true })
  })
})
