import type { VisualizerMode, VisualizerModeOption, VisualizerSceneTheme, MeshPresetConfig } from '../types'
import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import {
  Orbit,
  Mountain,
  Disc,
  Globe,
  Sparkles,
  Sun,
  Waves,
  BarChart2,
  Building2,
  type LucideIcon,
} from 'lucide-react'

export const VISUALIZER_MODES: VisualizerModeOption[] = [
  {
    id: 'wavy-19',
    name: 'Oceanic Swell',
    description: 'Undulating liquid tidal terrain with fluid wave crests, translucent glass facets & continuous drift',
    dimension: '3D',
    iconName: 'Waves',
  },
  {
    id: 'wavy-18',
    name: 'Mountain Summits',
    description: 'Towering vertical mountain peaks rising high above a deep saucer grid',
    dimension: '3D',
    iconName: 'Mountain',
  },
  {
    id: 'wavy-17',
    name: 'Luminous Canopy',
    description: 'Rich iridescent shaded canopy with large luminous pearl nodes',
    dimension: '3D',
    iconName: 'Sun',
  },
  {
    id: 'wavy-abyss',
    name: 'Abyssal Crater',
    description: 'Deep gravity crater with vertical harmonic ridges plunging to the core',
    dimension: '3D',
    iconName: 'Orbit',
  },
  {
    id: 'wavy-matrix',
    name: 'Laser Matrix',
    description: 'Pure razor-sharp laser wireframe matrix with recursive feedback echo',
    dimension: '3D',
    iconName: 'Waves',
  },
  {
    id: 'wavy-spiral-1',
    name: 'Galactic Vortex',
    description: 'Sweeping 2-arm logarithmic spiral galaxy with starlight nodes & celestial dust',
    dimension: '3D',
    iconName: 'Orbit',
  },
  {
    id: 'wavy-spiral-2',
    name: 'Double Helix',
    description: 'High-energy 4-turn intertwining neon corkscrew ribbons in an upward vortex cone',
    dimension: '3D',
    iconName: 'Waves',
  },
  {
    id: 'mesh-tunnel',
    name: 'Mesh Tunnel',
    description: 'First-person infinite 3D wireframe cylinder tunnel with audio-reactive warp pulses & album luminescence',
    dimension: '3D',
    iconName: 'Disc',
  },
  {
    id: 'sphere-mesh',
    name: 'Celestial Orb',
    description: 'Pulsing 3D geodesic wireframe sphere with frequency displacement & luminous nodal aura',
    dimension: '3D',
    iconName: 'Globe',
  },
  {
    id: 'sphere-rings',
    name: 'Ringed Nebula',
    description: 'Molten planetary core surrounded by concentric audio-reactive orbital gyro rings',
    dimension: '3D',
    iconName: 'Orbit',
  },
  {
    id: 'city-skyscrapers',
    name: 'Cyber Metropolis',
    description: 'Sprawling 3D grid of neon architectural towers and skyscrapers reacting to frequency bands',
    dimension: '3D',
    iconName: 'Building2',
  },
  {
    id: 'city-horizon',
    name: 'Neon Boulevard',
    description: 'Endless illuminated cyber avenue driving toward a towering audio-reactive skyline silhouette',
    dimension: '3D',
    iconName: 'Sun',
  },
  {
    id: 'spectrum-2d',
    name: '2D Spectrum',
    description: 'Clean symmetrical frequency bars with isolated acoustic bassline',
    dimension: '2D',
    iconName: 'BarChart2',
  },
]

export const MESH_PRESETS: Record<string, MeshPresetConfig> = {
  'wavy-19': {
    id: 'wavy-19',
    name: 'Oceanic Swell',
    description: 'Undulating liquid tidal terrain with fluid wave crests, translucent glass facets & continuous drift',
    variantNumber: 19,
    meshBend: -14,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.45,
    flowMix: 1.2,
    waveHeight: 2.2,
    waveSpeed: 1.1,
    perlinNoiseIntensity: 2.4,
    perlinNoiseSpeed: 0.8,
    dotSize: 0.15,
    dotGlow: 0.9,
    dotReactivity: 1.0,
    fillOpacity: 0.52,
    fillReactivity: 0.8,
    lineReactivity: 1.0,
    angleHueMix: 0.25,
    colorIntensity: 1.9,
    feedbackEnabled: true,
    feedbackDecay: 0.50,
    feedbackZoom: 1.01,
    cameraRotationSpeed: 0.0006,
  },
  'wavy-27': {
    id: 'wavy-27',
    name: 'Oceanic Swell',
    description: 'Undulating liquid tidal terrain with fluid wave crests and continuous drift',
    variantNumber: 27,
    meshBend: -16,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.4,
    flowMix: 1.2,
    waveHeight: 2.2,
    waveSpeed: 1.2,
    perlinNoiseIntensity: 2.6,
    perlinNoiseSpeed: 0.8,
    dotSize: 0.16,
    dotGlow: 0.9,
    dotReactivity: 1.0,
    fillOpacity: 0.55,
    fillReactivity: 0.8,
    lineReactivity: 1.0,
    angleHueMix: 0.25,
    colorIntensity: 1.8,
    feedbackEnabled: true,
    feedbackDecay: 0.48,
    feedbackZoom: 1.008,
    cameraRotationSpeed: 0.0006,
  },
  'wavy-18': {
    id: 'wavy-18',
    name: 'Mountain Summits',
    description: 'Towering vertical mountain peaks rising high above a deep saucer grid',
    variantNumber: 18,
    meshBend: -28,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.7,
    flowMix: 0.3,
    waveHeight: 3.6,
    waveSpeed: 0.8,
    perlinNoiseIntensity: 0.6,
    perlinNoiseSpeed: 0.5,
    dotSize: 0.1,
    dotGlow: 0.8,
    dotReactivity: 1.0,
    fillOpacity: 0.0,
    fillReactivity: 0.0,
    lineReactivity: 1.0,
    angleHueMix: 0.2,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.45,
    feedbackZoom: 1.01,
    cameraRotationSpeed: 0.0004,
    hasPeaks: true,
  },
  'wavy-17': {
    id: 'wavy-17',
    name: 'Luminous Canopy',
    description: 'Rich iridescent shaded canopy with large luminous pearl nodes',
    variantNumber: 17,
    meshBend: 36,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.8,
    flowMix: 0.8,
    waveHeight: 1.2,
    waveSpeed: 0.7,
    perlinNoiseIntensity: 1.2,
    perlinNoiseSpeed: 0.6,
    dotSize: 1.2,
    dotGlow: 1.0,
    dotReactivity: 1.0,
    fillOpacity: 0.72,
    fillReactivity: 1.0,
    lineReactivity: 0.9,
    angleHueMix: 0.25,
    colorIntensity: 2.0,
    feedbackEnabled: false,
    feedbackDecay: 0,
    feedbackZoom: 1.0,
    cameraRotationSpeed: 0.0003,
  },
  'wavy-16': {
    id: 'wavy-16',
    name: 'Pulsing Radar',
    description: 'Concentric radar rings with glowing beacon nodes firing along wavefronts',
    variantNumber: 16,
    meshBend: 0,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 1.0,
    flowMix: 0.0,
    waveHeight: 1.6,
    waveSpeed: 1.1,
    perlinNoiseIntensity: 0.0,
    perlinNoiseSpeed: 0.0,
    dotSize: 1.0,
    dotGlow: 1.0,
    dotReactivity: 1.0,
    fillOpacity: 0.0,
    fillReactivity: 0.0,
    lineReactivity: 1.0,
    angleHueMix: 0.2,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.6,
    feedbackZoom: 1.015,
    cameraRotationSpeed: 0.0005,
  },
  'wavy-14': {
    id: 'wavy-14',
    name: 'Sunflower Summits',
    description: '36 golden-angle sunflower mountain summits erupting from a mesh saucer',
    variantNumber: 14,
    meshBend: -6,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.5,
    flowMix: 0.3,
    waveHeight: 2.8,
    waveSpeed: 1.0,
    perlinNoiseIntensity: 0.5,
    perlinNoiseSpeed: 0.5,
    dotSize: 0.22,
    dotGlow: 0.9,
    dotReactivity: 1.0,
    fillOpacity: 0.18,
    fillReactivity: 0.5,
    lineReactivity: 1.0,
    angleHueMix: 0.2,
    colorIntensity: 2.0,
    feedbackEnabled: false,
    feedbackDecay: 0,
    feedbackZoom: 1.0,
    cameraRotationSpeed: 0.0008,
    hasPeaks: true,
  },
  'wavy-arena': {
    id: 'wavy-arena',
    name: 'Celestial Amphitheater',
    description: 'Upward-curving stadium bowl with massive concentric wave rings',
    variantNumber: 13,
    meshBend: 58,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 1.0,
    flowMix: 0.3,
    waveHeight: 4.0,
    waveSpeed: 1.1,
    perlinNoiseIntensity: 1.4,
    perlinNoiseSpeed: 0.46,
    dotSize: 0.18,
    dotGlow: 0.85,
    dotReactivity: 1.0,
    fillOpacity: 0.25,
    fillReactivity: 0.8,
    lineReactivity: 1.0,
    angleHueMix: 0.15,
    colorIntensity: 2.0,
    feedbackEnabled: false,
    feedbackDecay: 0,
    feedbackZoom: 1.0,
    cameraRotationSpeed: 0.0007,
  },
  'wavy-abyss': {
    id: 'wavy-abyss',
    name: 'Abyssal Crater',
    description: 'Deep gravity crater with vertical harmonic ridges plunging to the core',
    variantNumber: 22,
    meshBend: -65,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.9,
    flowMix: 0.4,
    waveHeight: 2.8,
    waveSpeed: 0.7,
    perlinNoiseIntensity: 1.8,
    perlinNoiseSpeed: 0.33,
    dotSize: 0.35,
    dotGlow: 0.65,
    dotReactivity: 1.0,
    fillOpacity: 0.28,
    fillReactivity: 1.0,
    lineReactivity: 0.85,
    angleHueMix: 0.35,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.58,
    feedbackZoom: 1.018,
    cameraRotationSpeed: 0.0006,
  },
  'wavy-beacon': {
    id: 'wavy-beacon',
    name: 'Radiant Beacon',
    description: 'Oversized glowing beacons pulsing across concentric radar wavefronts',
    variantNumber: 21,
    meshBend: 12,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 1.0,
    flowMix: 0.2,
    waveHeight: 2.0,
    waveSpeed: 1.2,
    perlinNoiseIntensity: 1.2,
    perlinNoiseSpeed: 0.2,
    dotSize: 2.4,
    dotGlow: 1.2,
    dotReactivity: 1.0,
    fillOpacity: 0.02,
    fillReactivity: 0.3,
    lineReactivity: 0.85,
    angleHueMix: 0.25,
    colorIntensity: 2.0,
    feedbackEnabled: false,
    feedbackDecay: 0,
    feedbackZoom: 1.0,
    cameraRotationSpeed: 0.0005,
  },
  'wavy-matrix': {
    id: 'wavy-matrix',
    name: 'Laser Matrix',
    description: 'Pure razor-sharp laser wireframe matrix with recursive feedback echo',
    variantNumber: 10,
    meshBend: 0,
    spiralTurns: 0,
    spectrumSpiral: 0,
    radialMix: 0.8,
    flowMix: 0.4,
    waveHeight: 1.4,
    waveSpeed: 1.0,
    perlinNoiseIntensity: 0,
    perlinNoiseSpeed: 0,
    dotSize: 0,
    dotGlow: 0,
    dotReactivity: 0,
    fillOpacity: 0,
    fillReactivity: 0,
    lineReactivity: 1.0,
    angleHueMix: 0.2,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.64,
    feedbackZoom: 1.022,
    cameraRotationSpeed: 0.0004,
  },
  'wavy-spiral-1': {
    id: 'wavy-spiral-1',
    name: 'Galactic Vortex',
    description: 'Sweeping 2-arm logarithmic spiral galaxy with starlight nodes & celestial dust',
    variantNumber: 28,
    meshBend: -25,
    spiralTurns: 2,
    spectrumSpiral: 1.0,
    radialMix: 0.5,
    flowMix: 0.5,
    waveHeight: 2.0,
    waveSpeed: 0.9,
    perlinNoiseIntensity: 1.2,
    perlinNoiseSpeed: 0.5,
    dotSize: 0.32,
    dotGlow: 0.95,
    dotReactivity: 1.0,
    fillOpacity: 0.30,
    fillReactivity: 0.5,
    lineReactivity: 1.0,
    angleHueMix: 0.25,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.52,
    feedbackZoom: 1.01,
    cameraRotationSpeed: 0.0006,
  },
  'wavy-spiral-2': {
    id: 'wavy-spiral-2',
    name: 'Double Helix',
    description: 'High-energy 4-turn intertwining neon corkscrew ribbons in an upward vortex cone',
    variantNumber: 29,
    meshBend: 32,
    spiralTurns: 4,
    spectrumSpiral: 1.5,
    radialMix: 0.3,
    flowMix: 0.8,
    waveHeight: 2.6,
    waveSpeed: 1.4,
    perlinNoiseIntensity: 0.0,
    perlinNoiseSpeed: 0.0,
    dotSize: 0.15,
    dotGlow: 0.7,
    dotReactivity: 1.0,
    fillOpacity: 0.04,
    fillReactivity: 0.2,
    lineReactivity: 1.0,
    angleHueMix: 0.2,
    colorIntensity: 2.0,
    feedbackEnabled: true,
    feedbackDecay: 0.58,
    feedbackZoom: 1.016,
    cameraRotationSpeed: 0.0014,
  },
}

export const getMeshPreset = (id: VisualizerMode): MeshPresetConfig => {
  return MESH_PRESETS[id] || MESH_PRESETS['wavy-19']
}

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
      { r: 28, g: 30, b: 68 },   // 1. Deep Twilight Navy (moody base)
      { r: 76, g: 68, b: 172 },  // 2. Royal Indigo (comfortable primary)
      { r: 132, g: 72, b: 200 }, // 3. Vibrant Orchid Violet (harmonic mid crest)
      { r: 156, g: 112, b: 216 },// 4. Soft Iris Lilac (upper ridge glow)
      { r: 196, g: 184, b: 236 },// 5. Frosted Pearl Highlight (gentle beacon tip)
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
  // Moderate saturation and luminance so colors are comfortable, elegant, and never blinding
  const sat = Math.max(55, Math.min(78, s1))
  const coreLum = Math.max(44, Math.min(54, l1))

  // 1. Base / Valleys: Deep, rich moody shadow tone
  const c1 = hslToRgbInternal(h1, Math.max(45, sat * 0.85), Math.max(26, Math.min(36, coreLum - 16)))

  // 2. Primary / Slopes: Authentic, comfortable album hue
  const c2 = hslToRgbInternal(h1, sat, coreLum)

  // 3. Harmonic Crest: Gentle analogous warm shift (+18°)
  const c3 = hslToRgbInternal((h1 + 18) % 360, Math.min(76, sat * 0.95), coreLum + 4)

  // 4. Upper Ridge: Soft analogous cool shift (-16°) or extracted edge
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

  // 5. Highlight / Pearls & Beacons: Soft tinted pearl mist (+6°), gentle luminance
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
    // Default signature gradient:
    // Left: Swirling Electric Magenta/Purple (#d946ef)
    // Mid: Royal Blue/Indigo (#3b82f6)
    // Right: Electric Neon Cyan (#06b6d4)
    return {
      low: { r: 217, g: 70, b: 239 },
      mid: { r: 59, g: 130, b: 246 },
      high: { r: 6, g: 182, b: 212 },
    }
  }

  // 1. Primary Low anchor: Authentic primary album accent with calibrated luminance
  const [h1, s1, l1] = rgbToHslInternal(accent.r, accent.g, accent.b)
  const low = hslToRgbInternal(h1, Math.max(72, s1), Math.max(48, Math.min(68, l1)))

  // 2. Secondary High anchor: Use extracted album edge / surface color
  const secondary = palette.edge || palette.surface
  let high: { r: number; g: number; b: number }

  if (secondary) {
    const diff = Math.abs(secondary.r - accent.r) + Math.abs(secondary.g - accent.g) + Math.abs(secondary.b - accent.b)
    const totalBrightness = secondary.r + secondary.g + secondary.b

    // If secondary has distinct color and isn't pitch black:
    if (diff > 35 && totalBrightness > 50) {
      const [h2, s2, l2] = rgbToHslInternal(secondary.r, secondary.g, secondary.b)
      high = hslToRgbInternal(h2, Math.max(70, s2), Math.max(48, Math.min(68, l2)))
    } else {
      // If monochromatic or edge is dark/same, use a harmonious luminous tint of the accent:
      const highHue = (h1 + 30) % 360
      high = hslToRgbInternal(highHue, Math.max(75, s1), Math.max(50, Math.min(65, l1 + 10)))
    }
  } else {
    const highHue = (h1 + 30) % 360
    high = hslToRgbInternal(highHue, Math.max(75, s1), 58)
  }

  // Mid anchor: Smooth blend between low and high
  const mid = {
    r: Math.round(low.r * 0.5 + high.r * 0.5),
    g: Math.round(low.g * 0.5 + high.g * 0.5),
    b: Math.round(low.b * 0.5 + high.b * 0.5),
  }

  return { low, mid, high }
}

export const paletteToSceneTheme = (
  palette: ExtractedPalette,
  hasArtwork?: boolean,
): VisualizerSceneTheme => {
  const accent = palette.accent || { r: 168, g: 85, b: 247 }
  const surface = palette.surface || { r: 30, g: 30, b: 40 }
  const bg = palette.background || { r: 12, g: 12, b: 18 }
  const edge = palette.edge || {
    r: Math.min(255, accent.r + 40),
    g: Math.min(255, accent.g + 50),
    b: Math.min(255, accent.b + 60),
  }

  const isDefaultPurple = accent.r === 168 && accent.g === 85 && accent.b === 247
  const isDefaultTan = accent.r === 204 && accent.g === 190 && accent.b === 150
  const isFallback = hasArtwork !== undefined ? !hasArtwork : (isDefaultPurple || isDefaultTan)
  const fiveColors = getFiveColorPalette(palette, hasArtwork)
  const gradientStops = getAlbumGradientStops(palette, hasArtwork)

  const [h, s, l] = rgbToHslInternal(accent.r, accent.g, accent.b)
  const albumHue = isFallback ? 0.78 : h / 360.0
  const albumSat = isFallback ? 0.92 : Math.max(0.75, s / 100.0)
  const albumVal = isFallback ? 0.85 : Math.max(0.70, l / 100.0)

  return {
    primaryHex: fiveColors.hexes[0],
    accentHex: fiveColors.hexes[1],
    surfaceHex: rgbToHexNumber(surface.r, surface.g, surface.b),
    backgroundHex: rgbToHexNumber(bg.r, bg.g, bg.b),
    accentRgb: fiveColors.rgbs[0],
    surfaceRgb: surface,
    backgroundRgb: bg,
    secondaryRgb: fiveColors.rgbs[1],
    hasCustomPalette: !isFallback,
    accentText: palette.accentText || 'var(--foreground)',
    colors: fiveColors.hexes,
    colorRgbs: fiveColors.rgbs,
    color1Hex: fiveColors.hexes[0],
    color2Hex: fiveColors.hexes[1],
    color3Hex: fiveColors.hexes[2],
    color4Hex: fiveColors.hexes[3],
    color5Hex: fiveColors.hexes[4],
    gradientLowRgb: fiveColors.rgbs[0],
    gradientMidRgb: fiveColors.rgbs[2],
    gradientHighRgb: fiveColors.rgbs[3],
    albumHue,
    albumSat,
    albumVal,
  }
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
  const nextIndex = (index + 1) % VISUALIZER_MODES.length
  return VISUALIZER_MODES[nextIndex].id
}

export const getPreviousVisualizerMode = (current: VisualizerMode): VisualizerMode => {
  const index = VISUALIZER_MODES.findIndex((m) => m.id === current)
  const prevIndex = (index - 1 + VISUALIZER_MODES.length) % VISUALIZER_MODES.length
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

  // 1. Bass: Deep, punchy, saturated bass tone (violet / plum / indigo)
  const bassRgb = {
    r: Math.min(255, Math.round(dominant.r * 0.7 + 55)),
    g: Math.min(255, Math.round(dominant.g * 0.5 + 25)),
    b: Math.min(255, Math.round(dominant.b * 0.8 + 80)),
  }

  // 2. Vocals: Luminous, warm vocal tone (amber / coral / golden primary)
  const vocalRgb = {
    r: Math.min(255, Math.round(accent.r * 0.85 + secondary.r * 0.15 + 40)),
    g: Math.min(255, Math.round(accent.g * 0.85 + secondary.g * 0.15 + 25)),
    b: Math.min(255, Math.round(accent.b * 0.85 + secondary.b * 0.15)),
  }

  // 3. Instruments: Crisp, high-frequency spectral shimmer (cyan / aqua / radiant emerald)
  const instrumentRgb = {
    r: Math.min(255, Math.round(accent.r * 0.3 + 45)),
    g: Math.min(255, Math.round(accent.g * 0.6 + 175)),
    b: Math.min(255, Math.round(accent.b * 0.7 + 205)),
  }

  return { bassRgb, vocalRgb, instrumentRgb }
}

export const calculateStemEnergies = (freqData: Uint8Array): StemEnergyBreakdown => {
  // Bass: bins 0 to 6 (~20Hz - 250Hz: kicks, sub-bass, 808s)
  let bSum = 0
  for (let i = 0; i <= 6; i++) {
    bSum += freqData[i] || 0
  }
  const bass = bSum / (7 * 255)

  // Vocals: bins 7 to 45 (~250Hz - 3,500Hz: speech & singing fundamentals + formant resonances)
  let vSum = 0
  for (let i = 7; i <= 45; i++) {
    vSum += freqData[i] || 0
  }
  const vocals = vSum / (39 * 255)

  // Instruments & Treble: bins 46 to 127 (~3,500Hz - 16,000Hz+: cymbals, synths, acoustic sparkle)
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

/**
 * Computes frequency color categorized across the 3 core musical stems:
 * - Bass (norm 0.0 - 0.28): Deep resonant bass tone
 * - Vocals (norm 0.28 - 0.68): Warm focused vocal tone
 * - Instruments (norm 0.68 - 1.0): Crisp shimmering instrument tone
 */
export const getFrequencyHeatmapColor = (
  norm: number,
  palette: ExtractedPalette,
  alpha = 1.0,
): string => {
  const { bassRgb, vocalRgb, instrumentRgb } = getStemPaletteColors(palette)

  let r: number, g: number, b: number

  if (norm < 0.28) {
    // Pure Bass Section to Early Vocals transition
    const t = norm / 0.28
    r = Math.round(bassRgb.r * (1 - t) + vocalRgb.r * t)
    g = Math.round(bassRgb.g * (1 - t) + vocalRgb.g * t)
    b = Math.round(bassRgb.b * (1 - t) + vocalRgb.b * t)
  } else if (norm < 0.68) {
    // Vocal Core to Instruments transition
    const t = (norm - 0.28) / 0.4
    r = Math.round(vocalRgb.r * (1 - t) + instrumentRgb.r * t)
    g = Math.round(vocalRgb.g * (1 - t) + instrumentRgb.g * t)
    b = Math.round(vocalRgb.b * (1 - t) + instrumentRgb.b * t)
  } else {
    // Instruments & High Harmonics
    const t = Math.min(1, (norm - 0.68) / 0.32)
    r = Math.min(255, Math.round(instrumentRgb.r * (1 - t) + 245 * t))
    g = Math.min(255, Math.round(instrumentRgb.g * (1 - t) + 245 * t))
    b = Math.min(255, Math.round(instrumentRgb.b * (1 - t) + 255 * t))
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const getVisualizerModeOption = (mode: VisualizerMode): VisualizerModeOption => {
  return VISUALIZER_MODES.find((m) => m.id === mode) || VISUALIZER_MODES[0]
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

export const getVisualizerModeIcon = (iconName: string): LucideIcon => {
  switch (iconName) {
    case 'Orbit':
      return Orbit
    case 'Mountain':
      return Mountain
    case 'Disc':
      return Disc
    case 'Globe':
      return Globe
    case 'Sparkles':
      return Sparkles
    case 'Sun':
      return Sun
    case 'Waves':
      return Waves
    case 'Building2':
      return Building2
    case 'BarChart2':
    default:
      return BarChart2
  }
}

export const isWebGLAvailable = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')

    if (!gl) return false

    const webgl = gl as WebGLRenderingContext
    if (typeof webgl.getShaderPrecisionFormat !== 'function') return false

    const vertHigh = webgl.getShaderPrecisionFormat(webgl.VERTEX_SHADER, webgl.HIGH_FLOAT)
    const fragHigh = webgl.getShaderPrecisionFormat(webgl.FRAGMENT_SHADER, webgl.HIGH_FLOAT)

    return Boolean(
      vertHigh &&
        typeof vertHigh.precision === 'number' &&
        fragHigh &&
        typeof fragHigh.precision === 'number',
    )
  } catch {
    return false
  }
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
