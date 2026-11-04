import type { CSSProperties } from 'react'

export interface ProcessedGameTheme {
  primaryRgb: [number, number, number]
  accentRgb: [number, number, number]
  surfaceRgb: [number, number, number]
  accentColor: string
  accentGlow: string
  borderGlow: string
  surfaceTint: string
  backdropUrl?: string | null
  gradientOverlay: string
  rowStyle: CSSProperties
}

/**
 * Convert RGB (0..255) to HSL (h: 0..360, s: 0..100, l: 0..100).
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
        break
      case gn:
        h = ((bn - rn) / d + 2) / 6
        break
      case bn:
        h = ((rn - gn) / d + 4) / 6
        break
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Convert HSL (h: 0..360, s: 0..100, l: 0..100) to RGB (0..255).
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

/**
 * Parse hex color string (#RGB or #RRGGBB) to [r, g, b].
 */
export function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null
  const clean = hex.replace(/^#/, '').trim()
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  return null
}

/**
 * Deterministic hash-to-hue generator for seed strings.
 */
export function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

/**
 * Build a complete ProcessedGameTheme from dominant and optional accent RGB colors.
 */
export function buildThemeFromColors(
  dominantRgb: [number, number, number],
  customAccentRgb?: [number, number, number] | null,
  backdropUrl?: string | null,
): ProcessedGameTheme {
  const [h, s, l] = rgbToHsl(dominantRgb[0], dominantRgb[1], dominantRgb[2])

  // Derive vibrant accent if not provided
  let accentRgb = customAccentRgb
  if (!accentRgb) {
    const accentS = Math.min(95, Math.max(55, Math.round(s * 1.25)))
    const accentL = Math.min(74, Math.max(52, l < 30 ? 55 : l > 80 ? 60 : l))
    accentRgb = hslToRgb(h, accentS, accentL)
  }

  // Derive dark, moody surface tint for glassmorphism
  const surfaceS = Math.min(30, Math.max(10, Math.round(s * 0.35)))
  const surfaceL = Math.min(18, Math.max(8, Math.round(l * 0.22)))
  const surfaceRgb = hslToRgb(h, surfaceS, surfaceL)

  const accentColor = `rgb(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]})`
  const accentGlow = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.3)`
  const borderGlow = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.45)`
  const surfaceTint = `rgba(${surfaceRgb[0]}, ${surfaceRgb[1]}, ${surfaceRgb[2]}, 0.88)`

  const sStr = surfaceRgb.join(', ')
  const safeBgUrl = backdropUrl ? backdropUrl.replace(/"/g, '\\"') : null
  const gradientOverlay = ''

  const rowStyle: CSSProperties = safeBgUrl
    ? {
        backgroundImage: `${gradientOverlay}, url("${safeBgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        backgroundRepeat: 'no-repeat',
      }
    : {
        backgroundColor: `rgba(${surfaceRgb[0]}, ${surfaceRgb[1]}, ${surfaceRgb[2]}, 0.25)`,
      }

  return {
    primaryRgb: dominantRgb,
    accentRgb,
    surfaceRgb,
    accentColor,
    accentGlow,
    borderGlow,
    surfaceTint,
    backdropUrl,
    gradientOverlay,
    rowStyle,
  }
}

/**
 * Generate a deterministic fallback theme for an item or string seed.
 */
export function getFallbackTheme(seed = 'otix-game', backdropUrl?: string | null): ProcessedGameTheme {
  const hue = stringToHue(seed)
  const dominantRgb = hslToRgb(hue, 50, 40)
  const accentRgb = hslToRgb(hue, 80, 60)
  return buildThemeFromColors(dominantRgb, accentRgb, backdropUrl)
}

/**
 * Extract dominant and accent colors from an ImageData object (quantized pixels).
 */
export function extractPaletteFromImageData(imageData: ImageData): {
  dominantRgb: [number, number, number]
  accentRgb: [number, number, number]
} {
  const pixels = imageData.data
  type Bucket = { r: number; g: number; b: number; count: number; sat: number; light: number; hue: number }
  const buckets: Bucket[] = []

  // Sample every 4th pixel for speed
  for (let i = 0; i < pixels.length; i += 16) {
    const a = pixels[i + 3]
    if (a < 128) continue
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]

    // Quantize to steps of 32
    const qr = Math.min(255, Math.round(r / 32) * 32)
    const qg = Math.min(255, Math.round(g / 32) * 32)
    const qb = Math.min(255, Math.round(b / 32) * 32)

    const [hue, sat, light] = rgbToHsl(qr, qg, qb)

    // Ignore near-black or near-white
    if (light < 8 || light > 92) continue

    const existing = buckets.find((bkt) => bkt.r === qr && bkt.g === qg && bkt.b === qb)
    if (existing) {
      existing.count++
    } else {
      buckets.push({ r: qr, g: qg, b: qb, count: 1, sat, light, hue })
    }
  }

  if (buckets.length === 0) {
    return {
      dominantRgb: [60, 75, 100],
      accentRgb: [90, 140, 240],
    }
  }

  // Sort by popularity for dominant
  buckets.sort((a, b) => b.count - a.count)
  const dominant = buckets[0]
  const dominantRgb: [number, number, number] = [dominant.r, dominant.g, dominant.b]

  // Pick best accent: chromatic, saturated, good lightness
  const chromaticBuckets = [...buckets]
    .filter((b) => b.sat >= 25 && b.light >= 30 && b.light <= 85)
    .sort((a, b) => {
      const aScore = a.sat * 2 + a.count * 0.1
      const bScore = b.sat * 2 + b.count * 0.1
      return bScore - aScore
    })

  const bestAccent = chromaticBuckets[0] || dominant
  const accentRgb: [number, number, number] = [bestAccent.r, bestAccent.g, bestAccent.b]

  return { dominantRgb, accentRgb }
}

// In-memory cache for extracted themes by URL
const themeCache = new Map<string, ProcessedGameTheme>()

/**
 * Retrieve cached theme or process colors from an image URL asynchronously.
 */
export async function extractThemeFromImageUrl(
  imageUrl: string,
  seed = 'game',
): Promise<ProcessedGameTheme> {
  const cached = themeCache.get(imageUrl)
  if (cached) return cached

  return new Promise<ProcessedGameTheme>((resolve) => {
    if (typeof window === 'undefined') {
      const fallback = getFallbackTheme(seed, imageUrl)
      themeCache.set(imageUrl, fallback)
      resolve(fallback)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.decoding = 'async'

    let resolved = false
    const finish = (theme: ProcessedGameTheme) => {
      if (resolved) return
      resolved = true
      themeCache.set(imageUrl, theme)
      resolve(theme)
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 32
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          finish(getFallbackTheme(seed, imageUrl))
          return
        }
        ctx.drawImage(img, 0, 0, 32, 32)
        const imageData = ctx.getImageData(0, 0, 32, 32)
        const { dominantRgb, accentRgb } = extractPaletteFromImageData(imageData)
        const theme = buildThemeFromColors(dominantRgb, accentRgb, imageUrl)
        finish(theme)
      } catch {
        // Fallback for tainted canvas / CORS issues
        finish(getFallbackTheme(seed, imageUrl))
      }
    }

    img.onerror = () => {
      finish(getFallbackTheme(seed, imageUrl))
    }

    // Safety timeout in case image loading stalls
    setTimeout(() => {
      finish(getFallbackTheme(seed, imageUrl))
    }, 2500)

    img.src = imageUrl
  })
}

/**
 * Synchronous cache lookup for an image URL.
 */
export function getCachedTheme(imageUrl?: string | null): ProcessedGameTheme | null {
  if (!imageUrl) return null
  return themeCache.get(imageUrl) || null
}
