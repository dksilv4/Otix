import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, resolveApiBaseUrl } from './config'
import { CLIENT_API_BASE_URL } from './api/client'
import * as desktopApi from './desktop/api'

describe('API_BASE_URL', () => {
  it('matches the axios client so browser fetch uses the Vite / reverse proxy', () => {
    expect(API_BASE_URL).toBe(CLIENT_API_BASE_URL)
    expect(API_BASE_URL).not.toContain('localhost:8000')
    expect(API_BASE_URL).not.toContain('otix.app')
  })

  it('resolves to local backend in desktop dev mode', () => {
    const isDesktopSpy = vi.spyOn(desktopApi, 'isDesktop').mockReturnValue(true)
    const originalDev = import.meta.env.DEV
    try {
      import.meta.env.DEV = true
      expect(resolveApiBaseUrl()).toBe('http://localhost:8000/api/v1')
    } finally {
      import.meta.env.DEV = originalDev
      isDesktopSpy.mockRestore()
    }
  })

  it('resolves to prod backend in desktop packaged prod mode', () => {
    const isDesktopSpy = vi.spyOn(desktopApi, 'isDesktop').mockReturnValue(true)
    const originalDev = import.meta.env.DEV
    try {
      import.meta.env.DEV = false
      expect(resolveApiBaseUrl()).toBe('https://otix.app/api/v1')
    } finally {
      import.meta.env.DEV = originalDev
      isDesktopSpy.mockRestore()
    }
  })

  it('resolves to custom server url on native mobile when configured', async () => {
    const platform = await import('./platform')
    const isNativeSpy = vi.spyOn(platform, 'isNativeMobile').mockReturnValue(true)
    localStorage.setItem('otix_custom_server_url', 'https://media.mydomain.com')
    try {
      expect(resolveApiBaseUrl()).toBe('https://media.mydomain.com/api/v1')
    } finally {
      localStorage.removeItem('otix_custom_server_url')
      isNativeSpy.mockRestore()
    }
  })

  it('resolves to otix.app backend on native mobile when no custom server set', async () => {
    const platform = await import('./platform')
    const isNativeSpy = vi.spyOn(platform, 'isNativeMobile').mockReturnValue(true)
    localStorage.removeItem('otix_custom_server_url')
    const originalDev = import.meta.env.DEV
    try {
      import.meta.env.DEV = false
      expect(resolveApiBaseUrl()).toBe('https://otix.app/api/v1')
    } finally {
      import.meta.env.DEV = originalDev
      isNativeSpy.mockRestore()
    }
  })
})
