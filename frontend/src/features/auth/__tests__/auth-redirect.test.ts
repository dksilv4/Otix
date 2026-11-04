import { describe, it, expect } from 'vitest'
import { getSafeRedirectUrl } from '../utils'

describe('getSafeRedirectUrl', () => {
  it('returns relative internal routes unchanged', () => {
    expect(getSafeRedirectUrl('/movies')).toBe('/movies')
    expect(getSafeRedirectUrl('/media/game/123?tab=achievements')).toBe('/media/game/123?tab=achievements')
    expect(getSafeRedirectUrl('/settings/nodes#connections')).toBe('/settings/nodes#connections')
    expect(getSafeRedirectUrl('/u/gamer123')).toBe('/u/gamer123')
  })

  it('rejects external protocol and scheme-relative URLs', () => {
    expect(getSafeRedirectUrl('https://evil.com')).toBe('/')
    expect(getSafeRedirectUrl('http://evil.com')).toBe('/')
    expect(getSafeRedirectUrl('//evil.com')).toBe('/')
    expect(getSafeRedirectUrl('/\\evil.com')).toBe('/')
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/')
  })

  it('rejects auth routes to prevent redirect loops', () => {
    expect(getSafeRedirectUrl('/auth')).toBe('/')
    expect(getSafeRedirectUrl('/auth/login')).toBe('/')
    expect(getSafeRedirectUrl('/auth/login?redirect=/settings')).toBe('/')
    expect(getSafeRedirectUrl('/auth/register')).toBe('/')
    expect(getSafeRedirectUrl('/login')).toBe('/')
    expect(getSafeRedirectUrl('/login?redirect=/settings')).toBe('/')
  })

  it('handles null, undefined, empty string, and whitespace', () => {
    expect(getSafeRedirectUrl(null)).toBe('/')
    expect(getSafeRedirectUrl(undefined)).toBe('/')
    expect(getSafeRedirectUrl('')).toBe('/')
    expect(getSafeRedirectUrl('   ')).toBe('/')
  })

  it('honors custom fallback when provided', () => {
    expect(getSafeRedirectUrl('https://evil.com', '/fallback')).toBe('/fallback')
    expect(getSafeRedirectUrl('/auth/login', '/fallback')).toBe('/fallback')
    expect(getSafeRedirectUrl(null, '/fallback')).toBe('/fallback')
  })
})
