import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'

export type VisualizerMode =
  | 'wavy-19'
  | 'wavy-27'
  | 'wavy-18'
  | 'wavy-17'
  | 'wavy-16'
  | 'wavy-14'
  | 'wavy-arena'
  | 'wavy-abyss'
  | 'wavy-beacon'
  | 'wavy-matrix'
  | 'wavy-spiral-1'
  | 'wavy-spiral-2'
  | 'mesh-tunnel'
  | 'sphere-mesh'
  | 'sphere-rings'
  | 'city-skyscrapers'
  | 'city-horizon'
  | 'spectrum-2d'
  | 'wavy-1'
  | 'wavy-15'
  | 'cosmic'
  | 'cyber'
  | 'waves'
  | 'radial'
  | 'monolith'
  | 'ambient'

export interface SavedCameraPresetState {
  azimuth: number
  polar: number
  radius: number
  targetX?: number
  targetY?: number
  targetZ?: number
}

export interface MeshPresetConfig {
  id: VisualizerMode
  name: string
  description: string
  variantNumber: number
  meshBend: number
  spiralTurns: number
  spectrumSpiral: number
  radialMix: number
  flowMix: number
  waveHeight: number
  waveSpeed: number
  perlinNoiseIntensity: number
  perlinNoiseSpeed: number
  dotSize: number
  dotGlow: number
  dotReactivity: number
  fillOpacity: number
  fillReactivity: number
  lineReactivity: number
  angleHueMix: number
  colorIntensity: number
  feedbackEnabled: boolean
  feedbackDecay: number
  feedbackZoom: number
  cameraRotationSpeed: number
  hasPeaks?: boolean
}

export interface VisualizerModeOption {
  id: VisualizerMode
  name: string
  description: string
  dimension: '3D' | '2D'
  iconName: string
}

export interface AudioFrameData {
  frequencyData: Uint8Array
  waveformData: Uint8Array
  bassWaveformData?: Uint8Array
  bass: number
  mid: number
  treble: number
  energy: number
  beat: number
  isPlaying: boolean
  position: number
  duration: number
  bpm?: number
  tempo?: number
  beatPhase?: number
  tempoPulse?: number
}

export interface VisualizerSceneTheme {
  primaryHex: number
  accentHex: number
  surfaceHex: number
  backgroundHex: number
  accentRgb: { r: number; g: number; b: number }
  surfaceRgb: { r: number; g: number; b: number }
  backgroundRgb: { r: number; g: number; b: number }
  accentText: string
  hasCustomPalette?: boolean
  // 5 distinct colors for rich multi-color visuals
  colors: [number, number, number, number, number]
  colorRgbs: [
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
    { r: number; g: number; b: number },
  ]
  color1Hex: number
  color2Hex: number
  color3Hex: number
  color4Hex: number
  color5Hex: number
  secondaryRgb?: { r: number; g: number; b: number }
  gradientLowRgb?: { r: number; g: number; b: number }
  gradientMidRgb?: { r: number; g: number; b: number }
  gradientHighRgb?: { r: number; g: number; b: number }
  albumHue?: number
  albumSat?: number
  albumVal?: number
}

export interface PersistentPlaybackSession {
  source: 'local' | 'plex' | 'jellyfin'
  track: {
    id: string
    title: string
    artist: string
    albumName: string
    albumArt: string | null
    durationMs: number
    ratingKey?: string
    serverId?: number | null
    partKey?: string | null
    path?: string
    url?: string
  }
  queue: Array<{
    id: string
    title: string
    artist: string
    albumName: string
    albumArt: string | null
    durationMs: number
    ratingKey?: string
    serverId?: number | null
    partKey?: string | null
    path?: string
    url?: string
  }>
  positionMs: number
  durationMs: number
  status: 'playing' | 'paused'
  repeatMode: 'off' | 'all' | 'one'
  isShuffled: boolean
  volume: number
  savedAt: number
}
