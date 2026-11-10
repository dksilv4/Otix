import type { VisualizerMode, VisualizerModeOption } from '../types'
import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { Sparkles, BarChart2, type LucideIcon } from 'lucide-react'

export const VISUALIZER_MODES: VisualizerModeOption[] = [
  {
    id: 'mesh-grid',
    name: '3D Mesh Grid',
    description: 'Real-time audio reactive 3D wireframe mesh with wave harmonics and liquid noise',
    dimension: '3D',
    iconName: 'Grid',
  },
  {
    id: 'spectrum-2d',
    name: '2D Spectrum',
    description: 'Clean symmetrical frequency bars with isolated acoustic bassline',
    dimension: '2D',
    iconName: 'BarChart2',
  },
]

export const rgbToHexNumber = (r: number, g: number, b: number): number => {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)))
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)
}

function rgbToHslInternal(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToRgbInternal(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

export const getFiveColorPalette = (
  palette: ExtractedPalette,
  hasArtwork?: boolean,
): {
  rgbs: [
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
  ]
  hexes: [number, number, number, number, number]
} => {
  const accent = palette.accent || { r: 168, g: 85, b: 247 }
  const isDefaultPurple = accent.r === 168 && accent.g === 85 && accent.b === 247
  const isDefaultTan = accent.r === 204 && accent.g === 190 && accent.b === 150
  const isFallback = hasArtwork !== undefined ? !hasArtwork : (isDefaultPurple || isDefaultTan)

  if (isFallback) {
    const fallbackRgbs: [
      { r: number; g: number; b: number },
      { r: number; g: number; b: number },
      { r: number; g: number; b: number },
      { r: number; g: number; b: number },
      { r: number; g: number; b: number },
    ] = [
      { r: 28, g: 30, b: 68 },
      { r: 76, g: 68, b: 172 },
      { r: 132, g: 72, b: 200 },
      { r: 156, g: 112, b: 216 },
      { r: 196, g: 184, b: 236 },
    ]
    return {
      rgbs: fallbackRgbs,
      hexes: [
        rgbToHexNumber(fallbackRgbs[0].r, fallbackRgbs[0].g, fallbackRgbs[0].b),
        rgbToHexNumber(fallbackRgbs[1].r, fallbackRgbs[1].g, fallbackRgbs[1].b),
        rgbToHexNumber(fallbackRgbs[2].r, fallbackRgbs[2].g, fallbackRgbs[2].b),
        rgbToHexNumber(fallbackRgbs[3].r, fallbackRgbs[3].g, fallbackRgbs[3].b),
        rgbToHexNumber(fallbackRgbs[4].r, fallbackRgbs[4].g, fallbackRgbs[4].b),
      ],
    }
  }

  const [h1, s1, l1] = rgbToHslInternal(accent.r, accent.g, accent.b)
  const sat = Math.max(55, Math.min(78, s1))
  const coreLum = Math.max(44, Math.min(54, l1))

  const c1 = hslToRgbInternal(h1, Math.max(45, sat * 0.85), Math.max(26, Math.min(36, coreLum - 16)))
  const c2 = hslToRgbInternal(h1, sat, coreLum)
  const c3 = hslToRgbInternal((h1 + 18) % 360, Math.min(76, sat * 0.95), coreLum + 4)

  let c4: { r: number; g: number; b: number }
  const secondary = palette.edge || palette.surface
  if (secondary) {
    const diff = Math.abs(secondary.r - accent.r) + Math.abs(secondary.g - accent.g) + Math.abs(secondary.b - accent.b)
    if (diff > 45 && secondary.r + secondary.g + secondary.b > 50) {
      const [h2, s2] = rgbToHslInternal(secondary.r, secondary.g, secondary.b)
      c4 = hslToRgbInternal(h2, Math.min(72, Math.max(50, s2)), coreLum + 6)
    } else {
      c4 = hslToRgbInternal((h1 - 16 + 360) % 360, Math.min(74, sat * 0.9), coreLum + 6)
    }
  } else {
    c4 = hslToRgbInternal((h1 - 16 + 360) % 360, Math.min(74, sat * 0.9), coreLum + 6)
  }

  const c5 = hslToRgbInternal((h1 + 6) % 360, Math.min(48, sat * 0.6), Math.min(68, coreLum + 16))

  const rgbs: [
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
  ] = [c1, c2, c3, c4, c5]

  return {
    rgbs,
    hexes: [
      rgbToHexNumber(c1.r, c1.g, c1.b),
      rgbToHexNumber(c2.r, c2.g, c2.b),
      rgbToHexNumber(c3.r, c3.g, c3.b),
      rgbToHexNumber(c4.r, c4.g, c4.b),
      rgbToHexNumber(c5.r, c5.g, c5.b),
    ],
  }
}

export const getAlbumGradientStops = (
  palette: ExtractedPalette,
  hasArtwork?: boolean,
): {
  low: { r: number; g: number; b: number }
  mid: { r: number; g: number; b: number }
  high: { r: number; g: number; b: number }
} => {
  const accent = palette.accent || { r: 168, g: 85, b: 247 }
  const isDefaultPurple = accent.r === 168 && accent.g === 85 && accent.b === 247
  const isDefaultTan = accent.r === 204 && accent.g === 190 && accent.b === 150
  const isFallback = hasArtwork !== undefined ? !hasArtwork : (isDefaultPurple || isDefaultTan)

  if (isFallback) {
    return {
      low: { r: 217, g: 70, b: 239 },
      mid: { r: 59, g: 130, b: 246 },
      high: { r: 6, g: 182, b: 212 },
    }
  }

  const [h1, s1, l1] = rgbToHslInternal(accent.r, accent.g, accent.b)
  const low = hslToRgbInternal(h1, Math.max(72, s1), Math.max(48, Math.min(68, l1)))

  const secondary = palette.edge || palette.surface
  let high: { r: number; g: number; b: number }

  if (secondary) {
    const diff = Math.abs(secondary.r - accent.r) + Math.abs(secondary.g - accent.g) + Math.abs(secondary.b - accent.b)
    const totalBrightness = secondary.r + secondary.g + secondary.b

    if (diff > 35 && totalBrightness > 50) {
      const [h2, s2, l2] = rgbToHslInternal(secondary.r, secondary.g, secondary.b)
      high = hslToRgbInternal(h2, Math.max(70, s2), Math.max(48, Math.min(68, l2)))
    } else {
      const highHue = (h1 + 30) % 360
      high = hslToRgbInternal(highHue, Math.max(75, s1), Math.max(50, Math.min(65, l1 + 10)))
    }
  } else {
    const highHue = (h1 + 30) % 360
    high = hslToRgbInternal(highHue, Math.max(75, s1), 58)
  }

  const mid = {
    r: Math.round(low.r * 0.5 + high.r * 0.5),
    g: Math.round(low.g * 0.5 + high.g * 0.5),
    b: Math.round(low.b * 0.5 + high.b * 0.5),
  }

  return { low, mid, high }
}

export const formatVisualizerTime = (ms: number): string => {
  if (isNaN(ms) || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const getNextVisualizerMode = (current: VisualizerMode): VisualizerMode => {
  const index = VISUALIZER_MODES.findIndex((m) => m.id === current)
  const validIndex = index >= 0 ? index : 0
  const nextIndex = (validIndex + 1) % VISUALIZER_MODES.length
  return VISUALIZER_MODES[nextIndex].id
}

export const getPreviousVisualizerMode = (current: VisualizerMode): VisualizerMode => {
  const index = VISUALIZER_MODES.findIndex((m) => m.id === current)
  const validIndex = index >= 0 ? index : 0
  const prevIndex = (validIndex - 1 + VISUALIZER_MODES.length) % VISUALIZER_MODES.length
  return VISUALIZER_MODES[prevIndex].id
}

export type MusicStemSection = 'bass' | 'vocals' | 'instruments' | 'mix'

export interface StemEnergyBreakdown {
  bass: number
  vocals: number
  instruments: number
  dominant: MusicStemSection
}

export const getStemPaletteColors = (palette: ExtractedPalette) => {
  const accent = palette.accent || { r: 168, g: 85, b: 247 }
  const dominant = palette.surface || accent
  const secondary = palette.edge || accent

  const bassRgb = {
    r: Math.min(255, Math.round(dominant.r * 0.7 + 55)),
    g: Math.min(255, Math.round(dominant.g * 0.5 + 25)),
    b: Math.min(255, Math.round(dominant.b * 0.8 + 80)),
  }

  const vocalRgb = {
    r: Math.min(255, Math.round(accent.r * 0.85 + secondary.r * 0.15 + 40)),
    g: Math.min(255, Math.round(accent.g * 0.85 + secondary.g * 0.15 + 25)),
    b: Math.min(255, Math.round(accent.b * 0.85 + secondary.b * 0.15)),
  }

  const instrumentRgb = {
    r: Math.min(255, Math.round(accent.r * 0.3 + 45)),
    g: Math.min(255, Math.round(accent.g * 0.6 + 175)),
    b: Math.min(255, Math.round(accent.b * 0.7 + 205)),
  }

  return { bassRgb, vocalRgb, instrumentRgb }
}

export const calculateStemEnergies = (freqData: Uint8Array): StemEnergyBreakdown => {
  let bSum = 0
  for (let i = 0; i <= 6; i++) {
    bSum += freqData[i] || 0
  }
  const bass = bSum / (7 * 255)

  let vSum = 0
  for (let i = 7; i <= 45; i++) {
    vSum += freqData[i] || 0
  }
  const vocals = vSum / (39 * 255)

  let iSum = 0
  for (let i = 46; i < 128; i++) {
    iSum += freqData[i] || 0
  }
  const instruments = iSum / (82 * 255)

  let dominant: MusicStemSection = 'mix'
  if (bass > vocals * 1.15 && bass > instruments * 1.15) {
    dominant = 'bass'
  } else if (vocals > bass * 1.1 && vocals > instruments * 1.05) {
    dominant = 'vocals'
  } else if (instruments > vocals * 1.1 && instruments > bass * 1.1) {
    dominant = 'instruments'
  }

  return { bass, vocals, instruments, dominant }
}

export const getFrequencyHeatmapColor = (
  norm: number,
  palette: ExtractedPalette,
  alpha = 1.0,
): string => {
  const { bassRgb, vocalRgb, instrumentRgb } = getStemPaletteColors(palette)

  let r: number, g: number, b: number

  if (norm < 0.28) {
    const t = norm / 0.28
    r = Math.round(bassRgb.r * (1 - t) + vocalRgb.r * t)
    g = Math.round(bassRgb.g * (1 - t) + vocalRgb.g * t)
    b = Math.round(bassRgb.b * (1 - t) + vocalRgb.b * t)
  } else if (norm < 0.68) {
    const t = (norm - 0.28) / 0.4
    r = Math.round(vocalRgb.r * (1 - t) + instrumentRgb.r * t)
    g = Math.round(vocalRgb.g * (1 - t) + instrumentRgb.g * t)
    b = Math.round(vocalRgb.b * (1 - t) + instrumentRgb.b * t)
  } else {
    const t = Math.min(1, (norm - 0.68) / 0.32)
    r = Math.min(255, Math.round(instrumentRgb.r * (1 - t) + 245 * t))
    g = Math.min(255, Math.round(instrumentRgb.g * (1 - t) + 245 * t))
    b = Math.min(255, Math.round(instrumentRgb.b * (1 - t) + 255 * t))
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const getAllVisualizerModes = (): VisualizerModeOption[] => {
  return [...VISUALIZER_MODES]
}

export const getVisualizerModeOption = (mode: VisualizerMode): VisualizerModeOption => {
  const builtIn = VISUALIZER_MODES.find((m) => m.id === mode)
  if (builtIn) return builtIn
  return VISUALIZER_MODES[0]
}

export const getAdjacentVisualizerMode = (
  currentMode: VisualizerMode,
  direction: 'prev' | 'next',
): VisualizerMode => {
  const currentIndex = VISUALIZER_MODES.findIndex((m) => m.id === currentMode)
  const validIndex = currentIndex >= 0 ? currentIndex : 0
  const delta = direction === 'next' ? 1 : -1
  const nextIndex = (validIndex + delta + VISUALIZER_MODES.length) % VISUALIZER_MODES.length
  return VISUALIZER_MODES[nextIndex].id
}

export const getVisualizerModeIcon = (_iconName: string): LucideIcon => {
  return BarChart2
}

export const buildFallbackMusicPlayerTheme = (
  palette: ExtractedPalette,
  hasArtwork?: boolean,
): MusicPlayerTheme => {
  const r = palette.accent?.r ?? 168
  const g = palette.accent?.g ?? 85
  const b = palette.accent?.b ?? 247

  return {
    palette,
    hasArtwork: Boolean(hasArtwork),
    accentRgb: `${r}, ${g}, ${b}`,
    accentText: 'text-primary',
    accentRgba: (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`,
    glowShadow: 'none',
    containerBackground: 'var(--dk-surface-base)',
    podBackground: 'var(--dk-surface-ghost)',
    borderColor: 'transparent',
    drawerBackdropGradient: '',
    textColor: 'text-foreground',
    subtextColor: 'text-muted-foreground',
    iconColor: 'currentColor',
    iconHoverColor: 'currentColor',
    dividerColor: 'transparent',
    isLightBackground: false,
  }
}
