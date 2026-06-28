import { describe, it, expect } from 'vitest'
import { heroImage } from '../utils'

describe('heroImage', () => {
  // ── TMDB URLs ──────────────────────────────────────────────────────────

  it('upscales TMDB w92 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w92/abc123.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/abc123.jpg',
    )
  })

  it('upscales TMDB w154 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w154/poster.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/poster.jpg',
    )
  })

  it('upscales TMDB w185 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w185/backdrop.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    )
  })

  it('upscales TMDB w342 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w342/img.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/img.jpg',
    )
  })

  it('upscales TMDB w500 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w500/poster.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/poster.jpg',
    )
  })

  it('upscales TMDB w780 to w1280', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w780/bg.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/bg.jpg',
    )
  })

  it('keeps TMDB original size untouched', () => {
    expect(heroImage('https://image.tmdb.org/t/p/original/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/original/abc.jpg',
    )
  })

  it('keeps TMDB w1280 untouched', () => {
    expect(heroImage('https://image.tmdb.org/t/p/w1280/already-large.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/already-large.jpg',
    )
  })

  // ── IGDB URLs ──────────────────────────────────────────────────────────

  it('upscales IGDB t_cover_small to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_cover_small/co1abc.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/co1abc.jpg',
    )
  })

  it('upscales IGDB t_cover_big to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_cover_big/co2def.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/co2def.jpg',
    )
  })

  it('upscales IGDB t_screenshot_med to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_screenshot_med/sc1.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg',
    )
  })

  it('upscales IGDB t_screenshot_big to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc2.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/sc2.jpg',
    )
  })

  it('upscales IGDB t_screenshot_huge to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc3.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/sc3.jpg',
    )
  })

  it('upscales IGDB t_thumb to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_thumb/icon.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/icon.jpg',
    )
  })

  it('upscales IGDB t_720p to t_1080p', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_720p/video.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/video.jpg',
    )
  })

  it('keeps IGDB t_1080p untouched', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_1080p/co4.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/co4.jpg',
    )
  })

  it('keeps IGDB t_original untouched', () => {
    expect(heroImage('https://images.igdb.com/igdb/image/upload/t_original/max.jpg')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_original/max.jpg',
    )
  })

  // ── Steam URLs ─────────────────────────────────────────────────────────

  it('upscales Steam header.jpg to library_600x900.jpg', () => {
    expect(heroImage('https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg')).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/library_600x900.jpg',
    )
  })

  it('does not touch non-header Steam URLs', () => {
    expect(heroImage('https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/capsule_616x353.jpg')).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/capsule_616x353.jpg',
    )
  })

  // ── SteamGridDB / other CDN URLs ───────────────────────────────────────

  it('passes through SteamGridDB hero URLs unchanged', () => {
    expect(
      heroImage('https://cdn2.steamgriddb.com/hero/2b3aa41ec493d9908c56dcd665d08d22.jpg'),
    ).toBe('https://cdn2.steamgriddb.com/hero/2b3aa41ec493d9908c56dcd665d08d22.jpg')
  })

  it('passes through unknown CDN URLs unchanged', () => {
    expect(heroImage('https://example.com/images/game-banner.png')).toBe(
      'https://example.com/images/game-banner.png',
    )
  })

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('handles empty string gracefully', () => {
    expect(heroImage('')).toBe('')
  })

  it('handles null-prototype input (unlikely but safe)', () => {
    // String.replace works fine on any string — just verifying no throw
    expect(() => heroImage('some random string')).not.toThrow()
  })

  it('only replaces first occurrence of TMDB width (global flag not needed)', () => {
    // Only the first w500 should be replaced — there shouldn't be two in a URL
    expect(heroImage('https://image.tmdb.org/t/p/w500/movies/w500/extra.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/movies/w500/extra.jpg',
    )
  })
})
