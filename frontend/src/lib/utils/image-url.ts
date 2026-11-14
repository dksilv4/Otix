/**
 * Utilities for normalizing and sanitizing image URLs to eliminate Mixed Content warnings.
 */

const UPLOAD_URL_REGEX = /\/(?:api\/v1\/)?uploads\/([0-9a-f]{32}\.[a-z0-9]+)$/i

const HTTPS_CDNS = [
  'steamstatic.com',
  'steamcontent.com',
  'steamcommunity.com',
  'tmdb.org',
  'themoviedb.org',
  'googleusercontent.com',
  'gravatar.com',
  'igdb.com',
  'steamgriddb.com',
  'fanart.tv',
  'thetvdb.com',
  'tvdb.com',
  'otix.app',
  'nocookie.net',
  'fandom.com',
  'wikimedia.org',
]

/**
 * Normalizes any image URL to ensure it never triggers Mixed Content errors on HTTPS pages.
 *
 * 1. Uploaded assets (containing /uploads/<32-hex>.<ext>) are normalized to root-relative
 *    `/uploads/<filename>` so they automatically inherit the page's current origin and protocol.
 * 2. Protocol-relative URLs (`//example.com/...`) are converted to `https://...`.
 * 3. On HTTPS pages (or when origin is HTTPS), any `http://` URLs matching known HTTPS-capable
 *    domains or the current origin are upgraded to `https://`.
 */
export function sanitizeImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  // Data URIs and Blob URLs are inherently safe
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  // Any local upload asset (UUID-named) should be root-relative /uploads/<name>
  const uploadMatch = trimmed.match(UPLOAD_URL_REGEX)
  if (uploadMatch) {
    return `/uploads/${uploadMatch[1]}`
  }

  // Protocol-relative URLs -> https://
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  // In browser on HTTPS (or when window is undefined in SSR/tests with https)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed)
      const host = parsed.hostname.toLowerCase()

      // Upgrade same-origin, otix.app, or known CDNs
      const isKnownSecure =
        host === window.location.hostname ||
        HTTPS_CDNS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`))

      // Any external HTTP URL on an HTTPS page will trigger a mixed content upgrade/warning in Chrome;
      // upgrading it directly avoids the browser warning entirely.
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')
      if (isKnownSecure || !isLocalhost) {
        parsed.protocol = 'https:'
        return parsed.toString()
      }
    } catch {
      // Invalid URL format, return original
    }
  }

  return trimmed
}

/**
 * Downscales huge original images (such as TMDB /original/ or IGDB t_original)
 * to crisp, lightweight card dimensions (w500 / t_cover_big) to prevent multi-megabyte payloads.
 */
export function optimizeCardImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  let result = sanitizeImageUrl(url)
  // TMDB — replace original with w500 for cards
  if (result.includes('image.tmdb.org/t/p/original/')) {
    result = result.replace('/t/p/original/', '/t/p/w500/')
  }
  // IGDB — replace t_original with t_cover_big for cards
  if (result.includes('images.igdb.com/igdb/image/upload/t_original/')) {
    result = result.replace('/t_original/', '/t_cover_big/')
  }
  return result
}

/**
 * Downscales transparent logo images from TMDB (/original/ to /w300/)
 * for crisp rendering without transferring high-resolution 4K/original assets.
 */
export function optimizeLogoImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  let result = sanitizeImageUrl(url)
  if (result.includes('image.tmdb.org/t/p/original/')) {
    result = result.replace('/t/p/original/', '/t/p/w300/')
  }
  return result
}
