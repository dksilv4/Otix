// TODO: Review this file
import { useEffect, useState } from 'react'

interface ExtractedPalette {
  background: { r: number; g: number; b: number }
  surface: { r: number; g: number; b: number }
  accent: { r: number; g: number; b: number }
  accentText: string
}

type Rgb = { r: number; g: number; b: number }

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

export function rgbCss(color: Rgb): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

export function rgbaCss(color: Rgb, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const toLinear = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function isHotRedHue(hue: number, saturation: number): boolean {
  return saturation > 45 && (hue <= 18 || hue >= 342)
}

function extractPalette(imageData: ImageData): ExtractedPalette {
  const pixels = imageData.data
  const colorBuckets: Array<Rgb & { count: number; sat: number; light: number }> = []

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (a < 128) continue

    const qr = Math.min(255, Math.round(r / 24) * 24)
    const qg = Math.min(255, Math.round(g / 24) * 24)
    const qb = Math.min(255, Math.round(b / 24) * 24)
    const [, sat, light] = rgbToHsl(r, g, b)

    const existing = colorBuckets.find(
      (c) => c.r === qr && c.g === qg && c.b === qb,
    )
    if (existing) {
      existing.count++
    } else {
      colorBuckets.push({ r: qr, g: qg, b: qb, count: 1, sat, light })
    }
  }

  if (colorBuckets.length === 0) {
    return DEFAULT_PALETTE
  }

  colorBuckets.sort((a, b) => b.count - a.count)
  const dominant = colorBuckets[0]
  const [dominantHue, dominantSat, dominantLight] = rgbToHsl(dominant.r, dominant.g, dominant.b)
  const dominantIsHotRed = isHotRedHue(dominantHue, dominantSat)
  const background = hslToRgb(
    dominantHue,
    Math.min(dominantIsHotRed ? 24 : 46, Math.max(12, dominantSat * (dominantIsHotRed ? 0.28 : 0.55))),
    Math.min(20, Math.max(8, dominantLight * 0.28)),
  )
  const surface = hslToRgb(
    dominantHue,
    Math.min(dominantIsHotRed ? 30 : 58, Math.max(14, dominantSat * (dominantIsHotRed ? 0.35 : 0.7))),
    Math.min(30, Math.max(14, dominantLight * 0.45)),
  )

  const accentSource = [...colorBuckets]
    .filter((color) => color.light >= 18 && color.light <= 86)
    .sort((a, b) => {
      const aDistinct = Math.min(1, colorDistance(a, background) / 160)
      const bDistinct = Math.min(1, colorDistance(b, background) / 160)
      const aLightScore = 1 - Math.abs(a.light - 55) / 55
      const bLightScore = 1 - Math.abs(b.light - 55) / 55
      const aHue = rgbToHsl(a.r, a.g, a.b)[0]
      const bHue = rgbToHsl(b.r, b.g, b.b)[0]
      const aRedPenalty = isHotRedHue(aHue, a.sat) ? 50 : 0
      const bRedPenalty = isHotRedHue(bHue, b.sat) ? 50 : 0
      const aScore = a.count * 0.35 + a.sat * 2.8 + aDistinct * 70 + aLightScore * 35 - aRedPenalty
      const bScore = b.count * 0.35 + b.sat * 2.8 + bDistinct * 70 + bLightScore * 35 - bRedPenalty
      return bScore - aScore
    })[0] ?? dominant
  const [accentHue, accentSat, accentLight] = rgbToHsl(accentSource.r, accentSource.g, accentSource.b)
  const accent = hslToRgb(
    accentHue,
    Math.min(88, Math.max(42, accentSat * 1.15)),
    Math.min(68, Math.max(42, accentLight)),
  )

  return {
    background,
    surface,
    accent,
    accentText: relativeLuminance(accent) > 0.48 ? '#111111' : '#ffffff',
  }
}

export const DEFAULT_PALETTE: ExtractedPalette = {
  background: { r: 18, g: 19, b: 24 },
  surface: { r: 30, g: 32, b: 40 },
  accent: { r: 204, g: 190, b: 150 },
  accentText: '#111111',
}

export function usePalette(imageUrl: string | null) {
  const [palette, setPalette] = useState<ExtractedPalette>(DEFAULT_PALETTE)

  useEffect(() => {
    if (!imageUrl) {
      return
    }

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'

    img.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      try {
        ctx.drawImage(img, 0, 0, 64, 64)
        const imageData = ctx.getImageData(0, 0, 64, 64)
        const p = extractPalette(imageData)
        if (!cancelled) setPalette(p)
      } catch {
        if (!cancelled) setPalette(DEFAULT_PALETTE)
      }
    }

    img.onerror = () => {
      if (!cancelled) setPalette(DEFAULT_PALETTE)
    }

    img.src = imageUrl
    return () => { cancelled = true }
  }, [imageUrl])

  return imageUrl ? palette : DEFAULT_PALETTE
}
