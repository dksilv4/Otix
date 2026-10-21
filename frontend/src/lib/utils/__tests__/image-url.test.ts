import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sanitizeImageUrl } from '../image-url'

describe('sanitizeImageUrl', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Reset to HTTPS for testing mixed content upgrades
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        protocol: 'https:',
        origin: 'https://otix.app',
        hostname: 'otix.app',
        host: 'otix.app',
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('handles null, undefined, and empty string', () => {
    expect(sanitizeImageUrl(null)).toBe('')
    expect(sanitizeImageUrl(undefined)).toBe('')
    expect(sanitizeImageUrl('')).toBe('')
    expect(sanitizeImageUrl('   ')).toBe('')
  })

  it('normalizes http://otix.app/uploads/<uuid>.webp to root-relative /uploads/<uuid>.webp', () => {
    const input = 'http://otix.app/uploads/c58230d426e24fc3947df07347c19d4c.webp'
    expect(sanitizeImageUrl(input)).toBe('/uploads/c58230d426e24fc3947df07347c19d4c.webp')
  })

  it('normalizes https://otix.app/uploads/<uuid>.webp to root-relative /uploads/<uuid>.webp', () => {
    const input = 'https://otix.app/uploads/c58230d426e24fc3947df07347c19d4c.webp'
    expect(sanitizeImageUrl(input)).toBe('/uploads/c58230d426e24fc3947df07347c19d4c.webp')
  })

  it('normalizes http://api:8000/uploads/<uuid>.png to root-relative /uploads/<uuid>.png', () => {
    const input = 'http://api:8000/uploads/c58230d426e24fc3947df07347c19d4c.png'
    expect(sanitizeImageUrl(input)).toBe('/uploads/c58230d426e24fc3947df07347c19d4c.png')
  })

  it('normalizes /api/v1/uploads/<uuid>.png to root-relative /uploads/<uuid>.png', () => {
    const input = '/api/v1/uploads/c58230d426e24fc3947df07347c19d4c.png'
    expect(sanitizeImageUrl(input)).toBe('/uploads/c58230d426e24fc3947df07347c19d4c.png')
  })

  it('preserves existing root-relative /uploads/<uuid>.png', () => {
    const input = '/uploads/c58230d426e24fc3947df07347c19d4c.png'
    expect(sanitizeImageUrl(input)).toBe('/uploads/c58230d426e24fc3947df07347c19d4c.png')
  })

  it('preserves data URIs and blob URLs', () => {
    expect(sanitizeImageUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(sanitizeImageUrl('blob:https://otix.app/123')).toBe('blob:https://otix.app/123')
  })

  it('upgrades protocol-relative URLs to https', () => {
    expect(sanitizeImageUrl('//image.tmdb.org/t/p/w500/test.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/test.jpg',
    )
  })

  it('upgrades http:// CDN URLs to https on HTTPS pages', () => {
    expect(sanitizeImageUrl('http://avatars.steamstatic.com/avatar.jpg')).toBe(
      'https://avatars.steamstatic.com/avatar.jpg',
    )
    expect(sanitizeImageUrl('http://image.tmdb.org/t/p/w500/movie.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/movie.jpg',
    )
    expect(sanitizeImageUrl('http://images.igdb.com/igdb/image/upload/t_cover_big/game.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/game.jpg',
    )
    expect(sanitizeImageUrl('http://lh3.googleusercontent.com/photo.jpg')).toBe(
      'https://lh3.googleusercontent.com/photo.jpg',
    )
  })

  it('upgrades public non-local http image URLs on HTTPS pages to avoid browser mixed content warnings', () => {
    expect(sanitizeImageUrl('http://cdn.example.com/photo.png')).toBe(
      'https://cdn.example.com/photo.png',
    )
  })

  it('preserves localhost/LAN HTTP URLs when on HTTP pages', () => {
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        protocol: 'http:',
        hostname: 'localhost',
      },
      writable: true,
      configurable: true,
    })
    expect(sanitizeImageUrl('http://localhost:8080/image.png')).toBe(
      'http://localhost:8080/image.png',
    )
    expect(sanitizeImageUrl('http://192.168.1.100:8080/image.png')).toBe(
      'http://192.168.1.100:8080/image.png',
    )
  })
})
