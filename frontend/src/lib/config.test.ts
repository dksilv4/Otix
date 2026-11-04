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
      expect(resolveApiBaseUrl()).toBe('http://127.0.0.1:8000/api/v1')
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
})
