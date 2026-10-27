import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildYouTubeEmbedUrl } from '../trailer'

describe('buildYouTubeEmbedUrl — Adversarial & Security Edge Cases', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Reset window.location mock
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    })
  })

  const setLocation = (protocol: string, origin: string) => {
    delete (window as any).location
    ;(window as any).location = {
      protocol,
      origin,
      href: `${origin}/`,
      host: origin.replace(/^https?:\/\//, ''),
      hostname: origin.replace(/^https?:\/\//, '').split(':')[0],
      pathname: '/',
      search: '',
      hash: '',
    }
  }

  it('sanitizes Electron custom protocol app:// to https://www.youtube.com', () => {
    setLocation('app:', 'app://otix')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).not.toContain('origin=app')
    expect(url).toContain('origin=https://www.youtube.com')
  })

  it('sanitizes local filesystem protocol file:/// to https://www.youtube.com', () => {
    setLocation('file:', 'file://')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).not.toContain('origin=file')
    expect(url).toContain('origin=https://www.youtube.com')
  })

  it('sanitizes browser internal protocol chrome://settings to https://www.youtube.com', () => {
    setLocation('chrome:', 'chrome://settings')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).not.toContain('origin=chrome')
    expect(url).toContain('origin=https://www.youtube.com')
  })

  it('sanitizes extension protocol chrome-extension:// to https://www.youtube.com', () => {
    setLocation('chrome-extension:', 'chrome-extension://abcdefghijklmnop')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).not.toContain('origin=chrome-extension')
    expect(url).toContain('origin=https://www.youtube.com')
  })

  it('sanitizes javascript: or data: pseudo-protocols to https://www.youtube.com', () => {
    setLocation('javascript:', 'javascript:void(0)')
    const url1 = buildYouTubeEmbedUrl('dQw4w9WgXcQ')
    expect(url1).toContain('origin=https://www.youtube.com')

    setLocation('data:', 'data:text/html')
    const url2 = buildYouTubeEmbedUrl('dQw4w9WgXcQ')
    expect(url2).toContain('origin=https://www.youtube.com')
  })

  it('preserves and encodes standard http:// origins', () => {
    setLocation('http:', 'http://localhost:5173')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).toContain('&origin=http%3A%2F%2Flocalhost%3A5173')
  })

  it('preserves and encodes standard https:// origins', () => {
    setLocation('https:', 'https://otix.tv')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).toContain('&origin=https%3A%2F%2Fotix.tv')
  })

  it('falls back to https://www.youtube.com when http origin is empty string', () => {
    setLocation('http:', '')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ')

    expect(url).toContain('&origin=https://www.youtube.com')
  })

  it('handles empty string youtubeId gracefully without crashing', () => {
    setLocation('https:', 'https://otix.tv')
    const url = buildYouTubeEmbedUrl('')

    expect(url).toContain('https://www.youtube-nocookie.com/embed/?')
    expect(url).toContain('autoplay=1')
    expect(url).toContain('enablejsapi=1')
  })

  it('handles options: controls, mute, autoplay, loop, and playlist', () => {
    setLocation('https:', 'https://otix.tv')
    const url = buildYouTubeEmbedUrl('dQw4w9WgXcQ', {
      autoplay: false,
      controls: 1,
      mute: true,
      loop: true,
      playlist: 'playlist123',
    })

    expect(url).toContain('autoplay=0')
    expect(url).toContain('controls=1')
    expect(url).toContain('&mute=1')
    expect(url).toContain('&loop=1&playlist=playlist123')
  })

  it('evaluates malicious input with HTML/Script injection attempts in youtubeId', () => {
    setLocation('https:', 'https://otix.tv')
    const maliciousId = '"><script>alert(1)</script>'
    const url = buildYouTubeEmbedUrl(maliciousId)

    // Verify it is formed as embed URL without executing code
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/')).toBe(true)
    expect(url).toContain(maliciousId)
  })

  it('evaluates parameter pollution attempts in youtubeId', () => {
    setLocation('https:', 'https://otix.tv')
    const pollutedId = 'validId?autoplay=0&origin=https://evil.com'
    const url = buildYouTubeEmbedUrl(pollutedId)

    // Note: Parameter pollution in unencoded ID results in double question marks:
    // .../embed/validId?autoplay=0&origin=https://evil.com?autoplay=1...
    expect(url).toContain(pollutedId)
  })
})
