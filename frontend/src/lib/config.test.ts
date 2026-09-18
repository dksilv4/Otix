import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from './config'
import { CLIENT_API_BASE_URL } from './api/client'

describe('API_BASE_URL', () => {
  it('matches the axios client so browser fetch uses the Vite / reverse proxy', () => {
    expect(API_BASE_URL).toBe(CLIENT_API_BASE_URL)
    expect(API_BASE_URL).not.toContain('localhost:8000')
    expect(API_BASE_URL).not.toContain('otix.app')
  })
})
