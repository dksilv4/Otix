import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Palette,
  Activity,
  Zap,
  Globe,
  Sparkles,
  Camera,
  Waves,
  Mountain,
  Layers,
} from 'lucide-react'
import {
  MESH_GRID_VERTEX_SHADER,
  MESH_GRID_FRAGMENT_SHADER,
  MESH_POINTS_VERTEX_SHADER,
  MESH_POINTS_FRAGMENT_SHADER,
  MESH_GLOW_POINTS_FRAGMENT_SHADER,
  PROCEDURAL_STARFIELD_VERTEX_SHADER,
  PROCEDURAL_STARFIELD_FRAGMENT_SHADER,
  MESH_FEEDBACK_VERTEX_SHADER,
  MESH_FEEDBACK_FRAGMENT_SHADER,
} from './mesh-grid-shaders'
import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'

export const CATEGORY_ICONS = {
  palette: Palette,
  activity: Activity,
  zap: Zap,
  globe: Globe,
  sparkles: Sparkles,
  camera: Camera,
  waves: Waves,
  mountain: Mountain,
  layers: Layers,
} as const

export interface MeshGridParams {
  gridSizeX: number
  gridSizeY: number
  cellSize: number
  waveHeight: number
  waveSpeed: number
  waveComplexity: number
  colorIntensity: number
  colorReactivity: number
  dampeningFactor: number
  jaggedness: number
  perlinNoiseIntensity: number
  perlinNoiseScale: number
  perlinNoiseSpeed: number
  meshBend: number
  sphereWrap: number // Degrees to wrap planar mesh into sphere: -360 to 360 (0 = flat plane, 180 = hemisphere, 360 = full globe, -360 = inverted globe)
  sphereRadius?: number // Radius of sphere when sphereWrap is active (default: 45.0)
  circleShape: boolean
  radialMix: number
  spectrumSpiral: number
  spiralTurns: number
  spectrumSpread: number
  flowMix: number
  flowDirection?: 'radial' | 'mountain-down' | 'top-down' | 'bottom-up' // Direction of wave propagation: 'mountain-down' (cascading down peak), 'radial' (concentric out), 'top-down' (cascading from top to bottom), 'bottom-up' (default: 'radial')
  angleHueMix: number
  fillOpacity: number
  fillReactivity: number
  lineReactivity: number
  dotSize: number
  dotReactivity: number
  dotGlow: number
  starfieldEnabled: boolean
  starDensity: number
  starTwinkleSpeed: number
  starAudioReactivity: number
  cameraPosition: { x: number; y: number; z: number }
  cameraTarget: { x: number; y: number; z: number }

  // Configurable height-driven color & wireframe options
  colorByHeight?: boolean // Whether vertex color is mapped strictly to physical vertical elevation instead of radial harmonics & angle sweeps (default: false)
  heightColorScale?: number // Scaling sensitivity for height color transitions (default: 1.0)
  colorLowCutoff?: number // Height cutoff for low/valley tone (default: 0.20)
  colorMidCutoff?: number // Height cutoff for mid tone (default: 0.60)
  colorApexCutoff?: number // Height cutoff where white apex begins (default: 0.88)
  apexHighlightIntensity?: number // Intensity of apex white highlight tip (default: 1.0)
  baselineWireframeAlpha?: number // Minimum baseline alpha of resting wireframe (default: 0.85)
  useAlbumPalette?: boolean // When true, tints visualizer with album art colors; when false, uses Variant 14 electric neon spectrum (default: false)

  // Central Mountain Feature
  centerMountainHeight?: number // Peak height multiplier of the central mountain peak (default: 0)
  centerMountainRadius?: number // Radial base footprint / spread of the central mountain (0.05 to 1.0, default: 0.35)
  centerMountainSharpness?: number // Summit curvature profile (0.5 = rounded caldera dome, 1.0 = bell, 2.5 = sharp peak spire, default: 1.2)
  mountainPeakCount?: number // Number of distinct alpine summits/spires in the massif: 1 to 9 (default: 1)
  mountainPeakSpread?: number // Radial dispersion of satellite peaks around center: 0.1 to 1.0 (default: 0.6)
  mountainRidgeDetail?: number // Sharpness of arête ridges and cols between peaks: 0.0 to 1.0 (default: 0.0)
  centerMountainAudioReactivity?: number // Dynamic audio reactivity multiplier for the mountain peak (default: 1.8)
  centerSpireReactivity?: number // Dedicated audio reactivity multiplier for the central summit spire (0.5 to 4.0, default: 1.8)
  centerMountainBaseHeight?: number // Resting bedrock elevation ratio between beats (0.0 to 1.0, default: 0.35)

  // Feedback Echo Trails (Optical feedback pass)
  feedback_enabled?: boolean // Whether ping-pong feedback loop is active (default: true for Variant 14)
  feedback_decay?: number // Trail persistence decay rate: 0.0 to 1.0 (default: 0.52)
  feedback_blendMode?: 'add' | 'mix' | 'max' // Blending mode: 'add' (radiant neon aura), 'mix' (smear), 'max' (screen)
  feedback_zoom?: number // Radial zoom per frame: 1.00 to 1.05 (default: 1.01)
  feedback_rotate?: number // Angular rotation of trails in degrees (default: 0)
  feedback_offsetX?: number // Horizontal drift translation of trails (default: 0)
  feedback_offsetY?: number // Vertical drift translation of trails (default: 0)
  feedback_hueShift?: number // Progressive hue shift of trails in degrees (default: 0)
  feedback_opacity?: number // Master opacity of feedback effect (default: 1.0)

  // Automated cinematic camera motion & viewport optics
  cameraFov?: number // Field of view in degrees: 30 to 120 (default: 75)
  cameraDamping?: number // OrbitControls mouse drag inertia damping: 0.01 to 0.20 (default: 0.05)
  cameraRotationY?: number // Continuous idle yaw rotation velocity around dome center (e.g. 0.0004)
  cameraRotationX?: number // Continuous pitch rotation velocity
  cameraRotationZ?: number // Continuous roll rotation velocity
  cameraAutoPitch?: number // Undulating camera pitch wave amplitude: 0.0 to 0.005 (default: 0.0)
  lockCameraOnPresetChange?: boolean // When true, auditioning presets preserves current 3D camera angle (default: false)

  // Audio analyzer calibration
  fftSize?: number // FFT resolution: 256 to 16384 (default: 16384 for Variant 14)
  sensitivity?: number // Audio sensitivity multiplier (default: 1.0)
  gain?: number // Master audio input gain multiplier (default: 1.0)
  smoothingTimeConstant?: number // Dynamic frequency smoothing: 0.0 to 1.0 (default: 0.72)
}

function perlinFade(t: number): number {
  return t * t * t * (t * (6 * t - 15) + 10)
}

function perlinGrad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

const PERLIN_PERMUTATION = (() => {
  const p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190,
    6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136,
    171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55,
    46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188,
    159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59,
    227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
    191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45,
    127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  ]
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) {
    perm[i] = perm[i + 256] = p[i]
  }
  return perm
})()

export function perlin3d(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  const Z = Math.floor(z) & 255

  x -= Math.floor(x)
  y -= Math.floor(y)
  z -= Math.floor(z)

  const u = perlinFade(x)
  const v = perlinFade(y)
  const w = perlinFade(z)

  const A = PERLIN_PERMUTATION[X] + Y
  const AA = PERLIN_PERMUTATION[A] + Z
  const AB = PERLIN_PERMUTATION[A + 1] + Z
  const B = PERLIN_PERMUTATION[X + 1] + Y
  const BA = PERLIN_PERMUTATION[B] + Z
  const BB = PERLIN_PERMUTATION[B + 1] + Z

  const l1 = perlinGrad(PERLIN_PERMUTATION[AA], x, y, z)
  const l2 = perlinGrad(PERLIN_PERMUTATION[BA], x - 1, y, z)
  const l3 = perlinGrad(PERLIN_PERMUTATION[AB], x, y - 1, z)
  const l4 = perlinGrad(PERLIN_PERMUTATION[BB], x - 1, y - 1, z)
  const i1 = l1 + u * (l2 - l1)
  const i2 = l3 + u * (l4 - l3)
  const j1 = i1 + v * (i2 - i1)

  const l5 = perlinGrad(PERLIN_PERMUTATION[AA + 1], x, y, z - 1)
  const l6 = perlinGrad(PERLIN_PERMUTATION[BA + 1], x - 1, y, z - 1)
  const l7 = perlinGrad(PERLIN_PERMUTATION[AB + 1], x, y - 1, z - 1)
  const l8 = perlinGrad(PERLIN_PERMUTATION[BB + 1], x - 1, y - 1, z - 1)
  const i3 = l5 + u * (l6 - l5)
  const i4 = l7 + u * (l8 - l7)
  const j2 = i3 + v * (i4 - i3)

  return 0.5 + 0.5 * (j1 + w * (j2 - j1))
}

/**
 * Calibrated 1:1 for "Mesh Grid Variant #14".
 * Fully calibrated for isolated boiling center peaks and fluid outer ripples.
 */
export const MESH_GRID_VARIANT_14_CONFIG: MeshGridParams = {
  gridSizeX: 177,
  gridSizeY: 177,
  cellSize: 1.0,
  waveHeight: 1.1,
  waveSpeed: 1.0,
  waveComplexity: 1.0,
  colorIntensity: 2.0,
  colorReactivity: 1.0,
  dampeningFactor: 0.6,
  jaggedness: 0.15, // Default: adds rich harmonic terraces and wave ridges
  perlinNoiseIntensity: 0.0,
  perlinNoiseScale: 0.01,
  perlinNoiseSpeed: 0.0,
  meshBend: -12.0, // Arched convex dome / planet horizon curve
  sphereWrap: 0.0, // Degrees: -360 to 360 (0 = flat plane, 180 = hemisphere, 360 = full globe, -360 = inverted globe)
  sphereRadius: 45.0,
  circleShape: true, // Circular disc mask
  radialMix: 0.5,
  spectrumSpiral: 0.0, // 0 spiral: concentric waterfall ripples
  spiralTurns: 3.0,
  spectrumSpread: 0.0,
  flowMix: 0.45, // 240-frame waterfall cascade
  flowDirection: 'radial', // Concentric center-to-edge ripple cascade
  angleHueMix: 0.3, // 30% 360-degree color wheel around center
  fillOpacity: 0.0, // Clean wireframe contour
  fillReactivity: 0.0,
  lineReactivity: 0.9,
  dotSize: 0.0,
  dotReactivity: 0.5,
  dotGlow: 0.0,
  starfieldEnabled: true,
  starDensity: 1.8,
  starTwinkleSpeed: 1.8,
  starAudioReactivity: 2.4,
  cameraPosition: { x: 32.679926, y: 23.563202, z: 98.956638 },
  cameraTarget: { x: 1.06613, y: -11.427769, z: 1.466933 },

  // Configurable height-driven color & wireframe options
  colorByHeight: false,
  heightColorScale: 1.0,
  colorLowCutoff: 0.20,
  colorMidCutoff: 0.60,
  colorApexCutoff: 0.88,
  apexHighlightIntensity: 1.0,
  baselineWireframeAlpha: 0.85, // Vibrant, luminous wireframe lines
  useAlbumPalette: false, // Variant 14 signature radiant neon spectrum

  // Central Mountain Feature (default off for standard presets)
  centerMountainHeight: 0.0,
  centerMountainRadius: 0.35,
  centerMountainSharpness: 1.2,
  mountainPeakCount: 1,
  mountainPeakSpread: 0.6,
  mountainRidgeDetail: 0.0,
  centerMountainAudioReactivity: 1.8,
  centerSpireReactivity: 1.0,
  centerMountainBaseHeight: 0.35,

  // Signature optical feedback trails
  feedback_enabled: true,
  feedback_decay: 0.52,
  feedback_blendMode: 'add',
  feedback_zoom: 1.01,
  feedback_rotate: 0,
  feedback_offsetX: 0,
  feedback_offsetY: 0,
  feedback_hueShift: 0,
  feedback_opacity: 1.0,

  // Camera kinematics & Audio calibration
  cameraFov: 75,
  cameraDamping: 0.05,
  cameraRotationY: 0.0,
  cameraAutoPitch: 0.0,
  lockCameraOnPresetChange: false,
  fftSize: 16384,
  sensitivity: 1.0,
  gain: 1.0,
  smoothingTimeConstant: 0.72,
}

export const DEFAULT_MESH_GRID_PARAMS: MeshGridParams = MESH_GRID_VARIANT_14_CONFIG

export interface MeshGridVariantPreset {
  id: string
  name: string
  description: string
  params: MeshGridParams
}

export const GRID_VARIANT_PRESETS: MeshGridVariantPreset[] = [
  {
    id: 'grid-preset-1',
    name: 'Preset 1 (Config 22 Subtle 2)',
    description: 'Mesh Grid Variant #1 (config-1741367309222-608)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 1.6,
      dampeningFactor: 0.95,
      radialMix: 1,
      cameraPosition: { x: 0.0442, y: 17.3324, z: 69.0056 },
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  },
  {
    id: 'grid-preset-2',
    name: 'Preset 2 (Mesh Grid Variant #18)',
    description: 'Mesh Grid Variant #2 (config-1785030020745-582)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 3,
      waveSpeed: 0.8,
      dampeningFactor: 0.65,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      meshBend: -11,
      radialMix: 0.25,
      spiralTurns: 8,
      fillOpacity: 0.1,
      lineReactivity: 1,
      dotSize: 0.12,
      dotReactivity: 1,
      dotGlow: 1,
      cameraRotationY: 0.0004,
      sensitivity: 0.6,
      cameraPosition: { x: 65.9367, y: -14.7677, z: -4.8937 },
      cameraTarget: { x: 2.7826, y: -12.0837, z: -6.4967 },
    },
  },
  {
    id: 'grid-preset-3',
    name: 'Preset 3 (Mesh Grid Variant #19)',
    description: 'Mesh Grid Variant #3 (config-1785194067514-982)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveSpeed: 0.8,
      dampeningFactor: 0,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      radialMix: 0.25,
      spectrumSpiral: 0.72,
      spiralTurns: 8,
      fillOpacity: 0.1,
      lineReactivity: 1,
      dotSize: 0.12,
      dotReactivity: 1,
      dotGlow: 1,
      feedback_decay: 0.575,
      cameraRotationY: 0.0004,
      cameraPosition: { x: -77.0422, y: 50.518, z: -46.9735 },
      cameraTarget: { x: -0.745, y: -12.2763, z: -2.6603 },
    },
  },
  {
    id: 'grid-preset-4',
    name: 'Preset 4 (Mesh Grid Variant #15)',
    description: 'Mesh Grid Variant #4 (config-1785005233398-8)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveSpeed: 0.8,
      dampeningFactor: 0,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      radialMix: 0.25,
      spectrumSpiral: 0.72,
      spiralTurns: 8,
      fillOpacity: 0.1,
      lineReactivity: 1,
      dotSize: 0.12,
      dotReactivity: 1,
      cameraRotationY: 0.0004,
      cameraPosition: { x: 62.5649, y: 50.518, z: -64.1157 },
      cameraTarget: { x: -0.745, y: -12.2763, z: -2.6603 },
    },
  },
  {
    id: 'grid-preset-5',
    name: 'Preset 5 (Mesh Grid Variant #17)',
    description: 'Mesh Grid Variant #5 (config-1785021591627-524)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 1,
      waveSpeed: 0.8,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      radialMix: 0.25,
      spiralTurns: 8,
      flowMix: 1,
      fillOpacity: 0.55,
      fillReactivity: 1,
      lineReactivity: 0.95,
      dotSize: 1,
      dotReactivity: 1,
      dotGlow: 0.78,
      cameraRotationY: 0.0004,
      cameraPosition: { x: -26.0051, y: 0.2278, z: -12.2247 },
      cameraTarget: { x: -0.745, y: -12.2763, z: -2.6603 },
    },
  },
  {
    id: 'grid-preset-6',
    name: 'Preset 6 (Mesh Grid Variant #16)',
    description: 'Mesh Grid Variant #6 (config-1785007646472-485)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveSpeed: 0.8,
      dampeningFactor: 0,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      radialMix: 0.25,
      spectrumSpiral: 0.72,
      spiralTurns: 8,
      flowMix: 0.6,
      fillOpacity: 0.1,
      fillReactivity: 1,
      dotSize: 1,
      dotReactivity: 1,
      dotGlow: 1,
      cameraRotationY: 0.0004,
      cameraPosition: { x: 78.1416, y: 50.518, z: 36.8595 },
      cameraTarget: { x: -0.745, y: -12.2763, z: -2.6603 },
    },
  },
  {
    id: 'grid-preset-7',
    name: 'Preset 7 (Config 22)',
    description: 'Mesh Grid Variant #7 (config-1740884813034-660)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      gridSizeX: 150,
      gridSizeY: 150,
      cellSize: 0.35,
      waveHeight: 0.8,
      waveSpeed: 0.6,
      waveComplexity: 0.1,
      colorIntensity: 0.35,
      dampeningFactor: 0.5,
      jaggedness: 0,
      perlinNoiseIntensity: 1.8,
      perlinNoiseScale: 0.09,
      perlinNoiseSpeed: 0.45,
      radialMix: 1,
      cameraRotationY: -0.0005,
      gain: 1.4,
      smoothingTimeConstant: 0.94,
      cameraPosition: { x: -12.0603, y: 7.1153, z: -34.7318 },
      cameraTarget: { x: -0.2743, y: -3.9141, z: 0.1181 },
    },
  },
  {
    id: 'grid-preset-8',
    name: 'Preset 8 (Mesh Grid 20:22:49)',
    description: 'Mesh Grid Variant #8 (config-1770772969796-306)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 1.6,
      waveSpeed: 0.5,
      dampeningFactor: 0.95,
      perlinNoiseScale: 0.15,
      perlinNoiseSpeed: 0.33,
      meshBend: -50,
      radialMix: 0.35,
      angleHueMix: 0.65,
      fillReactivity: 1,
      lineReactivity: 0.6,
      dotSize: 0.61,
      dotReactivity: 1,
      dotGlow: 0.27,
      sensitivity: 3.1,
      gain: 1.9,
      cameraPosition: { x: 52.1834, y: 3.726, z: -34.4198 },
      cameraTarget: { x: 9.1581, y: -41.7474, z: -5.7923 },
    },
  },
  {
    id: 'grid-preset-9',
    name: 'Preset 9 (Mesh Grid 21:00:05)',
    description: 'Mesh Grid Variant #9 (config-1770775205855-545)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 3.5,
      dampeningFactor: 0.95,
      perlinNoiseIntensity: 5,
      perlinNoiseSpeed: 0.15,
      meshBend: 50,
      radialMix: 1,
      gain: 2.8,
      cameraPosition: { x: -0.0001, y: 154.8386, z: 0.0001 },
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  },
  {
    id: 'grid-preset-10',
    name: 'Preset 10 (Mesh Grid 22:04:41)',
    description: 'Mesh Grid Variant #10 (config-1770951881130-725)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 3.5,
      dampeningFactor: 0.95,
      perlinNoiseIntensity: 5,
      perlinNoiseScale: 0.76,
      meshBend: -50,
      radialMix: 1,
      cameraRotationY: 0.0005,
      sensitivity: 1.4,
      gain: 2.8,
      smoothingTimeConstant: 0.88,
      cameraPosition: { x: -0.4052, y: 11.8599, z: -47.2162 },
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  },
  {
    id: 'grid-preset-11',
    name: 'Preset 11 (Mesh Grid 14:48:57)',
    description: 'Mesh Grid Variant #11 (config-1771357737340-827)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      cellSize: 0.85,
      waveHeight: 3.5,
      waveSpeed: 2.4,
      waveComplexity: 0.6,
      dampeningFactor: 0.95,
      perlinNoiseIntensity: 2.25,
      perlinNoiseScale: 1,
      meshBend: 50,
      radialMix: 0,
      cameraRotationY: 0.0005,
      gain: 2.8,
      cameraPosition: { x: -0.0695, y: -41.9274, z: 0.0931 },
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  },
  {
    id: 'grid-preset-12',
    name: 'Preset 12 (Mesh Grid 13:01:29)',
    description: 'Mesh Grid Variant #12 (config-1771264889154-560)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 3.5,
      waveSpeed: 1.1,
      dampeningFactor: 0.95,
      perlinNoiseIntensity: 5,
      perlinNoiseSpeed: 0.46,
      meshBend: 50,
      radialMix: 1,
      cameraRotationY: 0.0011,
      sensitivity: 1.8,
      gain: 2.2,
      cameraPosition: { x: -19.8165, y: -3.0445, z: 38.3745 },
      cameraTarget: { x: 9.1275, y: 23.9378, z: 10.5849 },
    },
  },
  {
    id: 'grid-preset-13',
    name: 'Preset 13 (Mesh Grid 10:59:34)',
    description: 'Mesh Grid Variant #13 (config-1784991574704-275)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      gridSizeX: 91,
      gridSizeY: 32,
      colorReactivity: 1.65,
      dampeningFactor: 0.65,
      flowMix: 0.35,
      fillOpacity: 0.65,
      fillReactivity: 1,
      cameraPosition: { x: -1.0913, y: 18.8619, z: 43.4143 },
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  },
  {
    id: 'grid-preset-14',
    name: 'Preset 14 (Mesh Grid Variant #10)',
    description: 'Mesh Grid Variant #14 (config-1784990794004-896)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
    },
  },
  {
    id: 'grid-preset-15',
    name: 'Preset 15 (Mesh Grid 12:10:30)',
    description: 'Mesh Grid Variant #15 (config-1784995830315-335)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveSpeed: 0.8,
      dampeningFactor: 0,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 0.93,
      radialMix: 0.25,
      flowMix: 0.6,
      angleHueMix: 0.25,
      fillOpacity: 1,
      fillReactivity: 1,
      dotSize: 0.6,
      dotGlow: 0.1,
      cameraPosition: { x: 40.2331, y: 19.4695, z: 95.721 },
      cameraTarget: { x: 1.6126, y: -20.3284, z: 2.7015 },
    },
  },
  {
    id: 'grid-preset-16',
    name: 'Preset 16 (Mesh Grid Variant #27)',
    description: 'Mesh Grid Variant #16 (config-1788733342537-16)',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 0.6,
      waveSpeed: 2.1,
      colorIntensity: 1.05,
      dampeningFactor: 0.25,
      jaggedness: 0,
      perlinNoiseIntensity: 1.35,
      perlinNoiseSpeed: 1,
      meshBend: -10,
      radialMix: 0.25,
      spiralTurns: 8,
      angleHueMix: 0.35,
      fillOpacity: 0.4,
      fillReactivity: 1,
      lineReactivity: 1,
      dotSize: 0.13,
      dotReactivity: 1,
      dotGlow: 1,
      cameraRotationY: 0.0012,
      gain: 2.9,
      smoothingTimeConstant: 0.28,
      cameraPosition: { x: 40.8122, y: 13.745, z: -57.6207 },
      cameraTarget: { x: 0.3145, y: -3.6022, z: 0.0199 },
    },
  },
]

export const MESH_GRID_PRESETS: MeshGridVariantPreset[] = [
  {
    id: 'variant-14',
    name: 'Preset 14 (Flagship)',
    description:
      'Flagship Variant 14 with 240-frame waterfall cascade and arched dome horizon',
    params: MESH_GRID_VARIANT_14_CONFIG,
  },
  {
    id: 'cosmic-globe',
    name: 'Cosmic Hemisphere Globe',
    description: '180-degree spherical warp with intense celestial starfield response',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      sphereWrap: 180,
      meshBend: 0,
      starAudioReactivity: 3.8,
      starDensity: 2.5,
    },
  },
  {
    id: 'calm-ocean',
    name: 'Calm Harmonic Ocean',
    description: 'Gentle rolling ripples and smooth fluid wave dynamics',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 0.6,
      waveSpeed: 0.5,
      jaggedness: 0.0,
      dampeningFactor: 0.85,
    },
  },
  {
    id: 'electric-storm',
    name: 'Electric Apex Storm',
    description: 'High complexity, aggressive jagged wave ridges with intense turbulence',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      waveHeight: 1.8,
      waveComplexity: 1.0,
      jaggedness: 0.45,
    },
  },
  {
    id: 'reactive-mountain',
    name: 'Reactive Mountain Massif',
    description:
      'Real-time audio-sculpted mountain massif with waves cascading down from the summits and zero noise',
    params: {
      ...MESH_GRID_VARIANT_14_CONFIG,
      perlinNoiseIntensity: 0.0,
      perlinNoiseScale: 0.0,
      perlinNoiseSpeed: 0.0,
      jaggedness: 0.0,
      centerMountainHeight: 14.0,
      centerMountainRadius: 0.32,
      centerMountainSharpness: 2.0,
      mountainPeakCount: 5,
      mountainPeakSpread: 0.52,
      mountainRidgeDetail: 0.35,
      centerMountainAudioReactivity: 1.0,
      centerSpireReactivity: 1.8,
      centerMountainBaseHeight: 0.28,
      flowDirection: 'mountain-down',
      flowMix: 0.55,
      colorByHeight: true,
      heightColorScale: 0.95,
      meshBend: 0.0,
      waveHeight: 1.1,
      waveSpeed: 0.9,
      dampeningFactor: 0.76,
      cameraPosition: { x: 32.0, y: 36.0, z: 96.0 },
      cameraTarget: { x: 0.0, y: 8.0, z: 0.0 },
    },
  },
  ...GRID_VARIANT_PRESETS,
]

export type CameraSnapPresetId = 'isometric' | 'hero' | 'top-down' | 'horizon' | 'close-up'

export interface CameraSnapDefinition {
  id: CameraSnapPresetId
  label: string
  subtitle: string
  tip: string
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  fov: number
}

export const CAMERA_SNAP_PRESETS: CameraSnapDefinition[] = [
  {
    id: 'isometric',
    label: 'Isometric',
    subtitle: 'Flagship 3D',
    tip: 'Balanced 3D isometric perspective angled at 45° across the surface',
    position: { x: 32.679926, y: 23.563202, z: 98.956638 },
    target: { x: 1.06613, y: -11.427769, z: 1.466933 },
    fov: 75,
  },
  {
    id: 'hero',
    label: 'Summit Hero',
    subtitle: 'Low Ascending',
    tip: 'Dramatic low-angle view looking upwards at the central massif summits',
    position: { x: 0.0, y: 12.0, z: 75.0 },
    target: { x: 0.0, y: 16.0, z: 0.0 },
    fov: 80,
  },
  {
    id: 'top-down',
    label: 'Bird’s Eye',
    subtitle: 'Overhead Radar',
    tip: 'Direct vertical 90° overhead view displaying ripples as a concentric mandala',
    position: { x: 0.0, y: 145.0, z: 0.01 },
    target: { x: 0.0, y: 0.0, z: 0.0 },
    fov: 70,
  },
  {
    id: 'horizon',
    label: 'Horizon',
    subtitle: 'Level Profile',
    tip: 'Flat grazing water-level silhouette showcasing vertical wave crests',
    position: { x: 0.0, y: 3.5, z: 110.0 },
    target: { x: 0.0, y: 2.0, z: 0.0 },
    fov: 65,
  },
  {
    id: 'close-up',
    label: 'Macro Spire',
    subtitle: 'Intimate Detail',
    tip: 'Close-in macro lens focused directly on active grid wireframe vertices',
    position: { x: 16.0, y: 18.0, z: 40.0 },
    target: { x: 0.0, y: 8.0, z: 0.0 },
    fov: 85,
  },
]

export type MeshGridParamType = 'slider' | 'switch' | 'select'

export interface MeshGridParamControlDef {
  key: keyof MeshGridParams
  label: string
  description?: string
  tip?: string
  minLabel?: string
  maxLabel?: string
  type: MeshGridParamType
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{ value: string | number; label: string }>
}

export interface MeshGridParamCategory {
  id: string
  title: string
  shortTitle?: string
  iconName: keyof typeof CATEGORY_ICONS
  description?: string
  controls: MeshGridParamControlDef[]
}

export const formatMeshGridParamValue = (key: keyof MeshGridParams, value: unknown): string => {
  if (key === 'flowDirection') {
    if (value === 'mountain-down') return 'Cascading Down Peak'
    if (value === 'top-down') return 'Top → Down'
    if (value === 'bottom-up') return 'Bottom → Up'
    return 'Concentric (Radial)'
  }
  if (key === 'colorByHeight') {
    return value ? 'Physical Height' : 'Radial Harmonics'
  }
  if (key === 'lockCameraOnPresetChange') {
    return value ? 'Locked' : 'Unlocked'
  }
  if (typeof value === 'boolean') {
    return value ? 'Enabled' : 'Disabled'
  }
  if (typeof value === 'number') {
    if (key === 'cameraFov') {
      return `${value.toFixed(0)}°`
    }
    if (key === 'cameraDamping') {
      return value.toFixed(2)
    }
    if (key === 'cameraAutoPitch') {
      return value === 0 ? 'Off' : `${(value * 1000).toFixed(1)} mrad`
    }
    if (
      key === 'heightColorScale' ||
      key === 'centerMountainAudioReactivity' ||
      key === 'centerMountainSharpness' ||
      key === 'centerSpireReactivity'
    ) {
      return `${value.toFixed(2)}x`
    }
    if (key === 'mountainPeakCount') {
      return `${value} Peak${value === 1 ? '' : 's'}`
    }
    if (
      key === 'centerMountainRadius' ||
      key === 'centerMountainBaseHeight' ||
      key === 'mountainPeakSpread' ||
      key === 'mountainRidgeDetail' ||
      key === 'dampeningFactor' ||
      key === 'jaggedness' ||
      key === 'flowMix' ||
      key === 'spectrumSpiral' ||
      key === 'baselineWireframeAlpha' ||
      key === 'fillOpacity' ||
      key === 'fillReactivity' ||
      key === 'lineReactivity' ||
      key === 'dotReactivity' ||
      key === 'feedback_decay' ||
      key === 'feedback_opacity'
    ) {
      return `${(value * 100).toFixed(0)}%`
    }
    if (key === 'centerMountainHeight') {
      return value === 0 ? 'Disabled' : `${value.toFixed(1)}`
    }
    if (key === 'meshBend' || key === 'sphereWrap' || key === 'feedback_rotate' || key === 'feedback_hueShift') {
      return `${value > 0 ? '+' : ''}${value.toFixed(key === 'meshBend' ? 1 : 0)}°`
    }
    if (
      key === 'waveHeight' ||
      key === 'waveSpeed' ||
      key === 'gain' ||
      key === 'sensitivity' ||
      key === 'starDensity' ||
      key === 'starTwinkleSpeed' ||
      key === 'starAudioReactivity'
    ) {
      return `${value.toFixed(1)}x`
    }
    if (key === 'feedback_zoom') {
      return `${value.toFixed(3)}x`
    }
    if (key === 'spiralTurns') {
      return `${value.toFixed(1)} turns`
    }
    if (key === 'fftSize') {
      return `${value} bins`
    }
    if (key === 'cameraRotationY') {
      return value === 0 ? 'Off' : `${(value * 1000).toFixed(1)} mrad`
    }
    return value.toFixed(2)
  }
  if (key === 'feedback_blendMode') {
    return value === 'add' ? 'Additive Aura' : 'Smooth Smear'
  }
  return String(value ?? '')
}

export const isControlModifiedFromDefault = (key: keyof MeshGridParams, value: unknown): boolean => {
  const defaultVal = MESH_GRID_VARIANT_14_CONFIG[key]
  if (defaultVal === undefined) return false
  if (typeof value === 'number' && typeof defaultVal === 'number') {
    return Math.abs(value - defaultVal) > 0.0001
  }
  return value !== defaultVal
}

export type PresetGroupFilter = 'all' | 'featured' | 'variants'

export const filterPresetsByGroup = (
  presets: MeshGridVariantPreset[],
  group: PresetGroupFilter,
): MeshGridVariantPreset[] => {
  if (group === 'featured') {
    return presets.filter((p) => !p.id.startsWith('grid-preset-') || p.id === 'grid-preset-14')
  }
  if (group === 'variants') {
    return presets.filter((p) => p.id.startsWith('grid-preset-'))
  }
  return presets
}

export const filterMeshGridCategories = (
  categories: MeshGridParamCategory[],
  searchQuery: string,
): MeshGridParamCategory[] => {
  const q = searchQuery.trim().toLowerCase()
  if (!q) return categories

  return categories
    .map((category) => {
      const filteredControls = category.controls.filter(
        (ctrl) =>
          ctrl.label.toLowerCase().includes(q) ||
          String(ctrl.key).toLowerCase().includes(q) ||
          (ctrl.description && ctrl.description.toLowerCase().includes(q)) ||
          (ctrl.tip && ctrl.tip.toLowerCase().includes(q)),
      )
      return {
        ...category,
        controls: filteredControls,
      }
    })
    .filter((cat) => cat.controls.length > 0)
}

export const getDefaultControlValue = <K extends keyof MeshGridParams>(key: K): MeshGridParams[K] => {
  return MESH_GRID_VARIANT_14_CONFIG[key]
}

export const isPresetActive = (preset: MeshGridVariantPreset, currentParams: MeshGridParams): boolean => {
  if (preset.id === 'variant-14' || preset.id === 'grid-preset-14') {
    return (
      Math.abs(currentParams.waveHeight - MESH_GRID_VARIANT_14_CONFIG.waveHeight) < 0.001 &&
      Math.abs(currentParams.flowMix - MESH_GRID_VARIANT_14_CONFIG.flowMix) < 0.001 &&
      Math.abs(currentParams.meshBend - MESH_GRID_VARIANT_14_CONFIG.meshBend) < 0.001 &&
      Math.abs(currentParams.sphereWrap - MESH_GRID_VARIANT_14_CONFIG.sphereWrap) < 0.001
    )
  }
  const p = preset.params
  return (
    Math.abs(currentParams.waveHeight - p.waveHeight) < 0.001 &&
    Math.abs(currentParams.waveSpeed - p.waveSpeed) < 0.001 &&
    Math.abs(currentParams.meshBend - p.meshBend) < 0.001 &&
    Math.abs(currentParams.radialMix - p.radialMix) < 0.001
  )
}

export const MESH_GRID_PARAM_CATEGORIES: MeshGridParamCategory[] = [
  {
    id: 'camera',
    title: 'Camera & Optics',
    shortTitle: 'Camera',
    iconName: 'camera',
    description: '3D viewport focal length, orbit dynamics, and camera stability',
    controls: [
      {
        key: 'cameraFov',
        label: 'Field of View (FOV)',
        description: 'Focal length of the perspective camera',
        tip: 'Wider FOV (>80°) creates a dynamic, dramatic fisheye perspective with expanded spatial depth. Narrower FOV (<50°) creates a flatter, cinematic telephoto look.',
        minLabel: 'Telephoto 30°',
        maxLabel: 'Fisheye 120°',
        type: 'slider',
        min: 30,
        max: 120,
        step: 1,
        unit: '°',
      },
      {
        key: 'cameraDamping',
        label: 'Inertia Damping',
        description: 'Smoothness of mouse drag inertia when orbiting or tilting',
        tip: 'Lower values (0.01) provide instantaneous mouse responsiveness; higher values (0.15) produce silky, floating cinematic camera inertia.',
        minLabel: 'Snappy 0.01',
        maxLabel: 'Silky Fluid 0.20',
        type: 'slider',
        min: 0.01,
        max: 0.2,
        step: 0.01,
      },
      {
        key: 'cameraRotationY',
        label: 'Idle Camera Yaw Rotation',
        description: 'Continuous smooth orbital camera drift around dome center',
        tip: 'Smooth automated orbital revolution drifting continuously around the visualizer center. Set to 0 to keep camera stationary.',
        minLabel: 'Counter-CW',
        maxLabel: 'Clockwise',
        type: 'slider',
        min: -0.005,
        max: 0.005,
        step: 0.0002,
      },
      {
        key: 'cameraAutoPitch',
        label: 'Wave Pitch Undulation',
        description: 'Rhythmic vertical oscillation of camera altitude',
        tip: 'Rhythmically bobs the camera altitude up and down like a ship riding gentle oceanic swells.',
        minLabel: 'Stationary',
        maxLabel: 'Floating Wave',
        type: 'slider',
        min: 0.0,
        max: 0.005,
        step: 0.0005,
      },
      {
        key: 'lockCameraOnPresetChange',
        label: 'Lock Camera on Preset Audition',
        description: 'Preserves current user 3D angle and zoom when changing presets',
        tip: 'When enabled, switching between presets or styles keeps your current 3D camera angle and zoom intact without snapping back.',
        type: 'switch',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio Calibration',
    shortTitle: 'Audio',
    iconName: 'activity',
    description: 'Real-time FFT audio spectrum analyzer calibration',
    controls: [
      {
        key: 'sensitivity',
        label: 'Audio Sensitivity',
        description: 'Responsiveness of surface ripple oscillations to track dynamics',
        tip: 'Amplifies the responsiveness of surface ripples and vertex spikes to track volume dynamics.',
        minLabel: 'Subtle 0.2x',
        maxLabel: 'Hyperactive 4.0x',
        type: 'slider',
        min: 0.2,
        max: 4.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'gain',
        label: 'Master Audio Gain',
        description: 'Input gain amplification factor for audio analysis',
        tip: 'Preamplification gain fed into the real-time FFT spectrum analyzer.',
        minLabel: 'Soft 0.2x',
        maxLabel: 'High Output 4.0x',
        type: 'slider',
        min: 0.2,
        max: 4.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'smoothingTimeConstant',
        label: 'Audio Smoothing',
        description: 'Temporal smoothing of audio reactivity between frames',
        tip: 'Balances lightning-fast transient twitch response versus silky continuous fluid animation.',
        minLabel: 'Instant Twitch 0.0',
        maxLabel: 'Silky Fluid 0.98',
        type: 'slider',
        min: 0.0,
        max: 0.98,
        step: 0.02,
      },
      {
        key: 'fftSize',
        label: 'FFT Analysis Resolution',
        description: 'Audio frequency bin resolution (16384 for flagship definition)',
        tip: 'Audio frequency bin resolution. 16384 bins provides Flagship ultra-definition waterfall clarity across every musical sub-harmonic.',
        type: 'select',
        options: [
          { value: 256, label: '256 bins (Fast / Low Latency)' },
          { value: 1024, label: '1024 bins (Standard)' },
          { value: 2048, label: '2048 bins (High Resolution)' },
          { value: 4096, label: '4096 bins (Very High Resolution)' },
          { value: 8192, label: '8192 bins (Ultra HD)' },
          { value: 16384, label: '16384 bins (Flagship HD)' },
        ],
      },
    ],
  },
  {
    id: 'wave',
    title: 'Wave Dynamics',
    shortTitle: 'Waves',
    iconName: 'waves',
    description: 'Propagation, velocity, and topological complexity of audio ripples',
    controls: [
      {
        key: 'waveHeight',
        label: 'Wave Height',
        description: 'Amplitude of audio-reactive surface ripples',
        tip: 'Vertical displacement amplitude of audio-reactive waves undulating across the mesh.',
        minLabel: 'Gentle Ripples',
        maxLabel: 'Towering Surges',
        type: 'slider',
        min: 0.1,
        max: 5.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'waveSpeed',
        label: 'Wave Speed',
        description: 'Rate of harmonic ripple oscillations',
        tip: 'Propagation frequency and oscillation tempo of surface harmonic waves.',
        minLabel: 'Slow Motion',
        maxLabel: 'Rapid Pulsing',
        type: 'slider',
        min: 0.1,
        max: 5.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'waveComplexity',
        label: 'Wave Complexity',
        description: 'Richness and harmonic layer count of terrain ripples',
        tip: 'Layers secondary harmonic frequencies into wave crests for richer topological detail.',
        minLabel: 'Pure Sine',
        maxLabel: 'Turbulent Harmonics',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'dampeningFactor',
        label: 'Motion Dampening',
        description: 'Inertia smoothing between animation frames',
        tip: 'Inertial decay factor dampening vertex velocity between consecutive animation frames.',
        minLabel: 'Aggressive & Raw',
        maxLabel: 'Silky Smooth Decay',
        type: 'slider',
        min: 0.0,
        max: 0.95,
        step: 0.05,
      },
      {
        key: 'jaggedness',
        label: 'Jaggedness',
        description: 'Quantized harmonic terraces and ridges',
        tip: 'Quantizes wave slopes into crisp, angular stepped terraces and geometric ridges.',
        minLabel: 'Smooth Slopes',
        maxLabel: 'Steep Terraced Ridges',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'flowMix',
        label: 'Waterfall Cascade',
        description: '240-frame outward propagating audio history cascade',
        tip: 'Injects a 240-frame historical audio buffer that cascades outward across the grid like a waterfall.',
        minLabel: 'Instantaneous',
        maxLabel: 'Continuous Waterfall',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'flowDirection',
        label: 'Wave Flow Direction',
        description: 'Direction of wave propagation: Concentric, Waterfall, or Ascending',
        tip: 'Propagation vector of wave ripples across the surface geometry.',
        type: 'select',
        options: [
          { value: 'mountain-down', label: 'Cascading Down Peak (Summit → Base)' },
          { value: 'radial', label: 'Concentric (Center → Out)' },
          { value: 'top-down', label: 'Waterfall (Top → Down)' },
          { value: 'bottom-up', label: 'Ascending (Bottom → Up)' },
        ],
      },
      {
        key: 'spectrumSpread',
        label: 'Spectrum Band Spread',
        description: 'Distributes frequency bands non-linearly across concentric ripples',
        tip: 'Distributes frequency bands logarithmically from low sub-bass to high treble across the grid.',
        minLabel: 'Low-End Concentrated',
        maxLabel: 'Wide Frequency Spread',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
    ],
  },
  {
    id: 'mountain',
    title: 'Central Mountain Massif',
    shortTitle: 'Mountain',
    iconName: 'mountain',
    description: 'Bass-reactive alpine spires, crater calderas, and craggy massif ridges',
    controls: [
      {
        key: 'centerMountainHeight',
        label: 'Central Mountain Height',
        description: 'Peak altitude of central mountain massif rising from the mesh (0 = off)',
        tip: 'Sculpts a massive central alpine massif that erupts dynamically with bass kicks and low frequencies.',
        minLabel: 'Disabled (0)',
        maxLabel: 'Colossal Alpine Peak',
        type: 'slider',
        min: 0.0,
        max: 80.0,
        step: 1.0,
      },
      {
        key: 'mountainPeakCount',
        label: 'Mountain Peak Count',
        description: 'Number of distinct alpine summits/spires in the central massif',
        tip: 'Distributes multiple distinct alpine spires and satellite summits across the mountain bedrock.',
        minLabel: 'Solitary Summit (1)',
        maxLabel: 'Massif Ridge (9)',
        type: 'slider',
        min: 1,
        max: 9,
        step: 1,
      },
      {
        key: 'centerMountainRadius',
        label: 'Central Mountain Radius',
        description: 'Radial base footprint / spread of the central mountain massif',
        tip: 'Radial base width and footprint of the central mountain massif across the grid.',
        minLabel: 'Tight Spire (5%)',
        maxLabel: 'Broad Range (80%)',
        type: 'slider',
        min: 0.05,
        max: 0.8,
        step: 0.02,
      },
      {
        key: 'mountainPeakSpread',
        label: 'Satellite Peak Spread',
        description: 'Radial dispersion of satellite mountain peaks around the central summit',
        tip: 'Radial dispersion of secondary alpine peaks surrounding the central summit.',
        minLabel: 'Clustered Center',
        maxLabel: 'Broad Perimeter',
        type: 'slider',
        min: 0.1,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'centerMountainSharpness',
        label: 'Mountain Peak Sharpness',
        description: 'Profile steepness: 0.5 = rounded dome, 1.2 = natural peak, 2.5+ = alpine spire',
        tip: 'Curvature profile of summits: 0.5 creates rounded volcanic domes; 2.5+ carves razor-sharp alpine spires.',
        minLabel: 'Dome Caldera (0.4x)',
        maxLabel: 'Needle Spire (5.0x)',
        type: 'slider',
        min: 0.4,
        max: 5.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'mountainRidgeDetail',
        label: 'Ridge Cragginess',
        description: 'Sharpness of arête ridges and cols connecting summits',
        tip: 'Sharpens connecting cols and knife-edge arête ridges between neighboring mountain summits.',
        minLabel: 'Smooth Slopes',
        maxLabel: 'Craggy Arête Ridges',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'centerMountainAudioReactivity',
        label: 'Mountain Audio Surge',
        description: 'How strongly the mountain peaks erupt and surge with audio dynamics',
        tip: 'How intensely the mountain peaks violently surge and expand in response to kick drums and bass drops.',
        minLabel: 'Static Bedrock',
        maxLabel: 'Explosive Volcanic Surge',
        type: 'slider',
        min: 0.0,
        max: 4.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'centerSpireReactivity',
        label: 'Center Summit Reactivity',
        description: 'How intensely the central mountain summit erupts and surges with bass beats',
        tip: 'Dedicated audio reactivity gain for the primary central summit spire.',
        minLabel: 'Subdued (0.5x)',
        maxLabel: 'Apex Lightning (4.0x)',
        type: 'slider',
        min: 0.5,
        max: 4.0,
        step: 0.1,
        unit: 'x',
      },
      {
        key: 'centerMountainBaseHeight',
        label: 'Mountain Bedrock Base',
        description: 'Resting baseline elevation ratio of the mountain between audio beats',
        tip: 'Resting elevation floor of the mountain massif maintained during quiet musical passages.',
        minLabel: 'Water-Level Flat',
        maxLabel: 'High Plateau Bedrock',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
        unit: '%',
      },
    ],
  },
  {
    id: 'geometry',
    title: 'Geometry & Curvature',
    shortTitle: 'Geometry',
    iconName: 'globe',
    description: 'Arched dome horizons, spherical wraps, circular masks, and spiral arms',
    controls: [
      {
        key: 'meshBend',
        label: 'Mesh Bend',
        description: 'Curvature of horizon dome: -12° = arched dome horizon',
        tip: 'Spherical curvature of the mesh horizon: -12° creates the signature Flagship arched dome horizon; positive values form an arena bowl.',
        minLabel: 'Arena Bowl (-50°)',
        maxLabel: 'Planet Dome (+50°)',
        type: 'slider',
        min: -50.0,
        max: 50.0,
        step: 0.5,
        unit: '°',
      },
      {
        key: 'sphereWrap',
        label: 'Sphere Wrap',
        description: 'Wrap flat grid into sphere: 0° = plane, 180° = hemisphere, 360° = globe',
        tip: 'Wraps the planar surface into 3D spherical topology. 0° is a flat plane, 180° forms a celestial hemisphere, 360° forms a complete orb.',
        minLabel: 'Inverted Shell (-360°)',
        maxLabel: 'Cosmic Globe (+360°)',
        type: 'slider',
        min: -360,
        max: 360,
        step: 10,
        unit: '°',
      },
      {
        key: 'sphereRadius',
        label: 'Sphere Wrap Radius',
        description: 'Orbital radius when sphere wrap is engaged (default: 45.0)',
        tip: 'Orbital radius of the 3D sphere when sphere wrap deformation is active.',
        minLabel: 'Compact Orb',
        maxLabel: 'Vast Celestial Shell',
        type: 'slider',
        min: 15.0,
        max: 80.0,
        step: 1.0,
      },
      {
        key: 'circleShape',
        label: 'Circle Mask Shape',
        description: 'Mask planar square mesh into a sleek round disc',
        tip: 'Clips the square grid mesh into a sleek, circular celestial disc with smooth antialiased outer borders.',
        type: 'switch',
      },
      {
        key: 'spectrumSpiral',
        label: 'Spectrum Spiral',
        description: 'Twists audio frequency bands along spiral arms',
        tip: 'Twists frequency ripple propagation along logarithmic spiral galaxy arms.',
        minLabel: 'Concentric Circles',
        maxLabel: 'Galactic Spiral Vortex',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'spiralTurns',
        label: 'Spiral Turns',
        description: 'Number of spiral revolution turns around center',
        tip: 'Number of complete revolutions the spiral arms twist around the center before reaching the boundary.',
        minLabel: 'Half Turn (0.5)',
        maxLabel: 'Deep Vortex (8.0)',
        type: 'slider',
        min: 0.5,
        max: 8.0,
        step: 0.5,
      },
    ],
  },
  {
    id: 'noise',
    title: 'Procedural Perlin Noise',
    shortTitle: 'Noise',
    iconName: 'layers',
    description: 'Organic mathematical continuous 3D noise terrain displacement',
    controls: [
      {
        key: 'perlinNoiseIntensity',
        label: 'Flowing Perlin Noise',
        description: 'Organic undulating 3D noise terrain displacement',
        tip: 'Procedural 3D Perlin noise displacing grid vertices into organic, undulating mountain terrain.',
        minLabel: 'Clean Geometry (0)',
        maxLabel: 'High Mountain Terrain',
        type: 'slider',
        min: 0.0,
        max: 5.0,
        step: 0.05,
      },
      {
        key: 'perlinNoiseScale',
        label: 'Perlin Noise Scale',
        description: 'Spatial frequency and density of organic terrain noise',
        tip: 'Spatial frequency and feature density of procedural noise terrain features.',
        minLabel: 'Vast Rolling Dunes',
        maxLabel: 'Dense Crags & Hills',
        type: 'slider',
        min: 0.01,
        max: 1.0,
        step: 0.01,
      },
      {
        key: 'perlinNoiseSpeed',
        label: 'Perlin Noise Speed',
        description: 'Time evolution velocity of organic terrain noise',
        tip: 'Continuous time evolution speed of organic noise ripples through 3D space.',
        minLabel: 'Frozen Geosphere',
        maxLabel: 'Rapid Boiling Flow',
        type: 'slider',
        min: 0.0,
        max: 2.0,
        step: 0.05,
      },
    ],
  },
  {
    id: 'theme',
    title: 'Theme & Coloring',
    shortTitle: 'Theme',
    iconName: 'palette',
    description: 'Palette mapping, height gradients, radiance, apex highlights, and node dots',
    controls: [
      {
        key: 'useAlbumPalette',
        label: 'Album Art Palette',
        description: 'Adapt wireframe gradient to current playing track artwork instead of electric neon spectrum',
        tip: 'Tints the wireframe mesh with harmonious colors extracted from the current playing track artwork instead of the electric neon spectrum.',
        type: 'switch',
      },
      {
        key: 'colorByHeight',
        label: 'Color by Physical Height',
        description: 'Map colors purely to vertical wave elevation instead of radial angles and harmonic sweeps',
        tip: 'Maps wireframe coloration purely to vertical vertex altitude (valleys to summit tips) instead of radial angle sweeps.',
        type: 'switch',
      },
      {
        key: 'heightColorScale',
        label: 'Height Color Sensitivity',
        description: 'Controls how rapidly colors climb from valley floor to peak tips as height increases',
        tip: 'Scales how quickly colors transition from valley floor tones up to radiant summit highlights.',
        minLabel: 'Gradual Gradient',
        maxLabel: 'Intense Apex Climb',
        type: 'slider',
        min: 0.2,
        max: 3.0,
        step: 0.05,
      },
      {
        key: 'colorIntensity',
        label: 'Color Radiance',
        description: 'Scales overall radiance (default: 2.0 = double brightness HDR)',
        tip: 'Overall brightness and luminance multiplier applied to wireframe shaders (2.0 = HDR double radiance).',
        minLabel: 'Muted Glow',
        maxLabel: 'Hyper Radiant Neon',
        type: 'slider',
        min: 0.0,
        max: 3.0,
        step: 0.05,
      },
      {
        key: 'colorReactivity',
        label: 'Color Reactivity',
        description: 'How strongly audio peaks shift color toward apex spectrum',
        tip: 'How dramatically energetic audio surges shift color temperatures towards radiant climax white.',
        minLabel: 'Constant Spectrum',
        maxLabel: 'Dynamic Peak Hue Shift',
        type: 'slider',
        min: 0.0,
        max: 2.0,
        step: 0.05,
      },
      {
        key: 'angleHueMix',
        label: 'Color Wheel (Angle)',
        description: '360-degree rainbow angle rotation around dome center',
        tip: 'Blends a 360-degree rainbow hue rotation circling around the visualizer center.',
        minLabel: 'Uniform Tone',
        maxLabel: '360° Rainbow Wheel',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'radialMix',
        label: 'Radial Mix',
        description: 'Concentric coordinate color gradient blending across circular disc',
        tip: 'Blends concentric color gradient transitions radiating from center origin out to the boundary.',
        minLabel: 'Uniform Field',
        maxLabel: 'Center-to-Edge Spectrum',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'lineReactivity',
        label: 'Line Reactivity',
        description: 'Luminance dynamics reacting to music signal',
        tip: 'Modulates wireframe line thickness and luminance dynamically with audio amplitude.',
        minLabel: 'Steady Luminance',
        maxLabel: 'Pulsing Glow Strobes',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'baselineWireframeAlpha',
        label: 'Resting Wireframe Opacity',
        description: 'Minimum resting alpha of wireframe lines during quiet passages',
        tip: 'Minimum baseline opacity of wireframe contour lines during quiet musical passages.',
        minLabel: 'Ghost Faint (10%)',
        maxLabel: 'Solid Bright (100%)',
        type: 'slider',
        min: 0.1,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'colorApexCutoff',
        label: 'Apex Color Threshold',
        description: 'Height threshold where wireframe transitions to climax highlight',
        tip: 'Relative elevation threshold where wireframe lines transition into climax highlights.',
        minLabel: 'Early Climax (50%)',
        maxLabel: 'Summit Only (99%)',
        type: 'slider',
        min: 0.5,
        max: 0.99,
        step: 0.01,
      },
      {
        key: 'apexHighlightIntensity',
        label: 'Apex White Highlight',
        description: 'Intensity of white flashing tip at musical climaxes',
        tip: 'Intensity of brilliant white flash tips that illuminate peak summits during musical drops.',
        minLabel: 'Off',
        maxLabel: 'Blinding White Climax',
        type: 'slider',
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      {
        key: 'fillOpacity',
        label: 'Solid Surface Fill',
        description: 'Optional semi-opaque surface mesh beneath wireframe lines',
        tip: 'Renders a semi-translucent shaded mesh surface underneath the wireframe contour lines.',
        minLabel: 'Pure Wireframe (0%)',
        maxLabel: 'Solid Shaded Mesh (100%)',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'fillReactivity',
        label: 'Fill Reactivity',
        description: 'Solid surface opacity modulation on loud audio peaks',
        tip: 'Modulates surface fill opacity dynamically on heavy bass hits and loud audio transients.',
        minLabel: 'Constant Fill',
        maxLabel: 'Bass Flare Strobes',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'dotSize',
        label: 'Grid Vertex Dots',
        description: 'Antialiased circular point dots on grid vertices',
        tip: 'Renders antialiased circular node dots at every geometric wireframe vertex intersection.',
        minLabel: 'Lines Only (0)',
        maxLabel: 'Prominent Star Nodes',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'dotReactivity',
        label: 'Dot Audio Reactivity',
        description: 'How strongly vertex dots swell and brighten with audio frequencies',
        tip: 'Scales vertex node dot radius and brightness in real time with high-frequency harmonics.',
        minLabel: 'Steady Nodes',
        maxLabel: 'Swelling Beacons',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'dotGlow',
        label: 'Dot Glow Halos',
        description: 'Additive luminous glow halo layer around active vertex dots',
        tip: 'Adds radiant luminous bloom halos around all active vertex dots.',
        minLabel: 'Crisp Points',
        maxLabel: 'Luminous Halos',
        type: 'slider',
        min: 0.0,
        max: 2.0,
        step: 0.05,
      },
    ],
  },
  {
    id: 'starfield',
    title: 'Cosmic Starfield',
    shortTitle: 'Starfield',
    iconName: 'sparkles',
    description: 'Procedural deep space starfield with luminescence and audio pulse flares',
    controls: [
      {
        key: 'starfieldEnabled',
        label: 'Starfield Background',
        description: 'Procedural celestial starfield rendered in deep space backdrop',
        tip: 'Renders a deep space procedural starfield behind the 3D visualizer canvas.',
        type: 'switch',
      },
      {
        key: 'starDensity',
        label: 'Star Density',
        description: 'Density of twinkling stars across background',
        tip: 'Density and population of celestial star points scattered throughout deep space.',
        minLabel: 'Sparse Constellation',
        maxLabel: 'Dense Star Cluster',
        type: 'slider',
        min: 0.1,
        max: 4.0,
        step: 0.1,
      },
      {
        key: 'starTwinkleSpeed',
        label: 'Twinkle Speed',
        description: 'Rate of star luminescence pulsing and twinkling',
        tip: 'Luminescence pulsing tempo and twinkling frequency of deep space stars.',
        minLabel: 'Serene Shimmer',
        maxLabel: 'Rapid Pulsar Sparkle',
        type: 'slider',
        min: 0.1,
        max: 4.0,
        step: 0.1,
      },
      {
        key: 'starAudioReactivity',
        label: 'Star Audio Sensitivity',
        description: 'How strongly starfield swells and flares on bass beats',
        tip: 'How violently stars swell, brighten, and strobe to the rhythm of bass drops.',
        minLabel: 'Ambient Stars',
        maxLabel: 'Pulsing Nova Beats',
        type: 'slider',
        min: 0.0,
        max: 5.0,
        step: 0.1,
      },
    ],
  },
  {
    id: 'feedback',
    title: 'Optical Feedback Echo',
    shortTitle: 'Feedback',
    iconName: 'zap',
    description: 'GPU ping-pong optical feedback buffer creating hypnotic neon motion trails',
    controls: [
      {
        key: 'feedback_enabled',
        label: 'Feedback Echo Trails',
        description: 'Optical feedback buffer creating glowing motion trails',
        tip: 'Engages a GPU ping-pong optical feedback buffer creating glowing motion trails.',
        type: 'switch',
      },
      {
        key: 'feedback_decay',
        label: 'Trail Persistence (Decay)',
        description: 'Persistence decay rate of optical echo trails (default: 0.52)',
        tip: 'Persistence decay rate of optical echo trails. Higher values create hypnotic lingering light trails.',
        minLabel: 'Quick Fade (10%)',
        maxLabel: 'Long Dream Trails (95%)',
        type: 'slider',
        min: 0.1,
        max: 0.95,
        step: 0.01,
      },
      {
        key: 'feedback_zoom',
        label: 'Feedback Radial Zoom',
        description: 'Outward radial expansion multiplier per frame (default: 1.01)',
        tip: 'Scales motion trails slightly outward (>1.0) or inward (<1.0) every frame, creating warp speed effects.',
        minLabel: 'Imploding Inward',
        maxLabel: 'Radiating Outward',
        type: 'slider',
        min: 0.98,
        max: 1.05,
        step: 0.005,
      },
      {
        key: 'feedback_opacity',
        label: 'Feedback Echo Opacity',
        description: 'Master brightness opacity of feedback glow trails (default: 1.0)',
        tip: 'Master intensity and alpha blend of optical feedback trails.',
        minLabel: 'Invisible',
        maxLabel: 'Full Radiant Echo',
        type: 'slider',
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      {
        key: 'feedback_blendMode',
        label: 'Echo Trail Blend Mode',
        description: 'Blending algorithm for optical feedback trails',
        tip: 'Blending algorithm: Additive creates a glowing neon laser aura; Alpha Mix creates a smooth liquid smear.',
        type: 'select',
        options: [
          { value: 'add', label: 'Additive (Radiant Neon Aura)' },
          { value: 'mix', label: 'Alpha Mix (Smooth Smear)' },
        ],
      },
      {
        key: 'feedback_rotate',
        label: 'Feedback Trail Rotation',
        description: 'Twists optical trails into angular vortexes',
        tip: 'Twists optical feedback trails progressively each frame into a mesmerizing kaleidoscope vortex.',
        minLabel: 'Counter-CW (-10°)',
        maxLabel: 'Clockwise (+10°)',
        type: 'slider',
        min: -10.0,
        max: 10.0,
        step: 0.5,
        unit: '°',
      },
      {
        key: 'feedback_hueShift',
        label: 'Feedback Hue Shift',
        description: 'Cycles color temperatures of decaying trails',
        tip: 'Continuously rotates color hues of motion trails as they echo into deep space.',
        minLabel: '-180° Spectrum',
        maxLabel: '+180° Spectrum',
        type: 'slider',
        min: -180,
        max: 180,
        step: 5,
        unit: '°',
      },
    ],
  },
]

export interface MeshGridSceneHandle {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  updateFrame: (
    dt: number,
    freqData: Uint8Array,
    bassEnergy: number,
    midEnergy: number,
  ) => void
  setAlbumTheme: (palette: ExtractedPalette | null) => void
  setParams: (newParams: Partial<MeshGridParams>, options?: { updateCamera?: boolean }) => void
  setCamera: (pos: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => void
  snapCameraTo: (presetId: CameraSnapPresetId) => void
  setCameraFov: (fov: number) => void
  resetParams: () => void
  resetCamera: () => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

export const createMeshGridScene = (
  canvas: HTMLCanvasElement,
  initialParams: MeshGridParams = DEFAULT_MESH_GRID_PARAMS,
): MeshGridSceneHandle => {
  const params: MeshGridParams = { ...initialParams }
  const { gridSizeX, gridSizeY } = params

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    params.cameraFov ?? 75,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.1,
    2000,
  )

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    precision: 'highp',
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
  renderer.setPixelRatio(dpr)
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  // Exact fixed camera perspective looking down at dome horizon
  camera.position.set(params.cameraPosition.x, params.cameraPosition.y, params.cameraPosition.z)
  camera.lookAt(params.cameraTarget.x, params.cameraTarget.y, params.cameraTarget.z)

  // Interactive OrbitControls for 3D dragging, orbiting, and zoom
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(params.cameraTarget.x, params.cameraTarget.y, params.cameraTarget.z)
  controls.enableDamping = true
  controls.dampingFactor = params.cameraDamping ?? 0.05
  controls.enableZoom = true
  controls.enablePan = true
  controls.enableRotate = true
  controls.mouseButtons.RIGHT = null // Left drag = rotate, wheel = zoom
  controls.update()

  const setCamera = (pos: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => {
    camera.position.set(pos.x, pos.y, pos.z)
    controls.target.set(target.x, target.y, target.z)
    camera.lookAt(target.x, target.y, target.z)
    controls.update()
  }

  const snapCameraTo = (presetId: CameraSnapPresetId) => {
    const snap = CAMERA_SNAP_PRESETS.find((s) => s.id === presetId)
    if (!snap) return
    setCamera(snap.position, snap.target)
    if (snap.fov) {
      camera.fov = snap.fov
      camera.updateProjectionMatrix()
    }
  }

  const setCameraFov = (fov: number) => {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }

  const resetCamera = () => {
    const defaultPos = MESH_GRID_VARIANT_14_CONFIG.cameraPosition
    const defaultTarget = MESH_GRID_VARIANT_14_CONFIG.cameraTarget
    setCamera(defaultPos, defaultTarget)
    camera.fov = MESH_GRID_VARIANT_14_CONFIG.cameraFov ?? 75
    camera.updateProjectionMatrix()
    controls.dampingFactor = MESH_GRID_VARIANT_14_CONFIG.cameraDamping ?? 0.05
  }

  // 1. Procedural Starfield GLSL Quad (rendered in clip-space behind the 3D scene)
  const starColor = new THREE.Color(0xffffff)
  const starfieldGeo = new THREE.PlaneGeometry(2, 2)
  const starfieldMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor1: { value: new THREE.Color(0x000000) },
      uColor2: { value: starColor },
      uStarDensity: { value: params.starDensity },
      uTwinkleSpeed: { value: params.starTwinkleSpeed },
      uAudioReactivity: { value: params.starAudioReactivity },
      uTime: { value: 0 },
      uAudioValue: { value: 0 },
    },
    vertexShader: PROCEDURAL_STARFIELD_VERTEX_SHADER,
    fragmentShader: PROCEDURAL_STARFIELD_FRAGMENT_SHADER,
    depthWrite: false,
    depthTest: false,
  })
  const starfieldMesh = new THREE.Mesh(starfieldGeo, starfieldMaterial)
  starfieldMesh.renderOrder = -100
  scene.add(starfieldMesh)

  // 2. Plane Geometry on ground XZ plane (177x177 vertices)
  const geometry = new THREE.PlaneGeometry(
    gridSizeX * params.cellSize,
    gridSizeY * params.cellSize,
    gridSizeX - 1,
    gridSizeY - 1,
  )
  geometry.rotateX(-Math.PI / 2)

  const posAttr = geometry.attributes.position
  const vertexCount = posAttr.count
  const basePositions = new Float32Array(posAttr.array.length)
  basePositions.set(posAttr.array)

  const prevHeights = new Float32Array(vertexCount)
  const frequencies = new Float32Array(vertexCount)
  const elevations = new Float32Array(vertexCount)
  const planarPositions = new Float32Array(vertexCount * 2)

  for (let i = 0; i < vertexCount; i++) {
    planarPositions[2 * i] = basePositions[3 * i]
    planarPositions[2 * i + 1] = basePositions[3 * i + 2]
  }

  geometry.setAttribute('frequency', new THREE.BufferAttribute(frequencies, 1))
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1))
  geometry.setAttribute('planarPos', new THREE.BufferAttribute(planarPositions, 2))

  // Color uniforms (strictly updated only on song change!)
  const baseColor = new THREE.Color(0x000000)
  const uLowColor = new THREE.Color(0x221144)
  const uMidColor = new THREE.Color(0x00d4aa)
  const uHighColor = new THREE.Color(0xffb800)
  const uAngleColor1 = new THREE.Color(0xff0088)
  const uAngleColor2 = new THREE.Color(0x00ffcc)
  const uAngleColor3 = new THREE.Color(0x8800ff)
  const uHasPalette = { value: params.useAlbumPalette ? 1.0 : 0.0 }
  const uColorByHeight = { value: params.colorByHeight ? 1.0 : 0.0 }

  // 3. Optional Solid Surface Fill Mesh Underneath (active when fillOpacity > 0)
  const fillMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      uLowColor: { value: uLowColor },
      uMidColor: { value: uMidColor },
      uHighColor: { value: uHighColor },
      uAngleColor1: { value: uAngleColor1 },
      uAngleColor2: { value: uAngleColor2 },
      uAngleColor3: { value: uAngleColor3 },
      uHasPalette,
      uColorByHeight,
      time: { value: 0 },
      colorIntensity: { value: params.colorIntensity },
      colorReactivity: { value: params.colorReactivity },
      circleMode: { value: params.circleShape ? 1 : 0 },
      gridHalfX: { value: (gridSizeX * params.cellSize) / 2 },
      gridHalfZ: { value: (gridSizeY * params.cellSize) / 2 },
      angleHueMix: { value: params.angleHueMix },
      surfaceOpacity: { value: params.fillOpacity ?? 0.0 },
      surfaceShade: { value: 0.55 },
      fillReactivity: { value: params.fillReactivity ?? 0.0 },
      uColorLowCutoff: { value: params.colorLowCutoff ?? 0.20 },
      uColorMidCutoff: { value: params.colorMidCutoff ?? 0.60 },
      uColorApexCutoff: { value: params.colorApexCutoff ?? 0.88 },
      uApexHighlight: { value: params.apexHighlightIntensity ?? 1.0 },
      uBaselineAlpha: { value: params.baselineWireframeAlpha ?? 0.85 },
    },
    vertexShader: MESH_GRID_VERTEX_SHADER,
    fragmentShader: MESH_GRID_FRAGMENT_SHADER,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const fillMesh = new THREE.Mesh(geometry, fillMaterial)
  fillMesh.renderOrder = 1
  fillMesh.visible = (params.fillOpacity ?? 0) > 0
  scene.add(fillMesh)

  // 4. Wireframe Material & Mesh (crisp radiant HDR lines)
  const wireframeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      uLowColor: { value: uLowColor },
      uMidColor: { value: uMidColor },
      uHighColor: { value: uHighColor },
      uAngleColor1: { value: uAngleColor1 },
      uAngleColor2: { value: uAngleColor2 },
      uAngleColor3: { value: uAngleColor3 },
      uHasPalette,
      uColorByHeight,
      time: { value: 0 },
      colorIntensity: { value: params.colorIntensity },
      colorReactivity: { value: params.colorReactivity },
      circleMode: { value: params.circleShape ? 1 : 0 },
      gridHalfX: { value: (gridSizeX * params.cellSize) / 2 },
      gridHalfZ: { value: (gridSizeY * params.cellSize) / 2 },
      angleHueMix: { value: params.angleHueMix },
      surfaceOpacity: { value: 1.0 },
      surfaceShade: { value: 1.0 },
      fillReactivity: { value: params.lineReactivity },
      uColorLowCutoff: { value: params.colorLowCutoff ?? 0.20 },
      uColorMidCutoff: { value: params.colorMidCutoff ?? 0.60 },
      uColorApexCutoff: { value: params.colorApexCutoff ?? 0.88 },
      uApexHighlight: { value: params.apexHighlightIntensity ?? 1.0 },
      uBaselineAlpha: { value: params.baselineWireframeAlpha ?? 0.85 },
    },
    vertexShader: MESH_GRID_VERTEX_SHADER,
    fragmentShader: MESH_GRID_FRAGMENT_SHADER,
    side: THREE.FrontSide, // FrontSide eliminates tangled backface wireframe clutter via hardware culling
    wireframe: true,
    transparent: false,
    depthWrite: true,
  })
  const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial)
  wireframeMesh.renderOrder = 2
  scene.add(wireframeMesh)

  // 5. Antialiased Solid Point Dots on Grid Vertices
  const solidPointsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      time: { value: 0 },
      colorIntensity: { value: params.colorIntensity },
      colorReactivity: { value: params.colorReactivity },
      circleMode: { value: params.circleShape ? 1 : 0 },
      gridHalfX: { value: (gridSizeX * params.cellSize) / 2 },
      gridHalfZ: { value: (gridSizeY * params.cellSize) / 2 },
      angleHueMix: { value: params.angleHueMix },
      uColorByHeight,
      dotSize: { value: params.dotSize },
      dotReactivity: { value: params.dotReactivity },
      uPixelRatio: { value: renderer.getPixelRatio() },
      sizeMul: { value: 1.0 },
    },
    vertexShader: MESH_POINTS_VERTEX_SHADER,
    fragmentShader: MESH_POINTS_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
  const solidPointsMesh = new THREE.Points(geometry, solidPointsMaterial)
  solidPointsMesh.renderOrder = 3
  solidPointsMesh.visible = (params.dotSize ?? 0) > 0
  scene.add(solidPointsMesh)

  // 6. Additive Glow Halos around Grid Vertices
  const glowPointsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: baseColor },
      time: { value: 0 },
      colorIntensity: { value: params.colorIntensity },
      colorReactivity: { value: params.colorReactivity },
      circleMode: { value: params.circleShape ? 1 : 0 },
      gridHalfX: { value: (gridSizeX * params.cellSize) / 2 },
      gridHalfZ: { value: (gridSizeY * params.cellSize) / 2 },
      angleHueMix: { value: params.angleHueMix },
      uColorByHeight,
      dotSize: { value: params.dotSize },
      dotReactivity: { value: params.dotReactivity },
      dotGlow: { value: params.dotGlow },
      uPixelRatio: { value: renderer.getPixelRatio() },
      sizeMul: { value: 3.5 },
    },
    vertexShader: MESH_POINTS_VERTEX_SHADER,
    fragmentShader: MESH_GLOW_POINTS_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const glowPointsMesh = new THREE.Points(geometry, glowPointsMaterial)
  glowPointsMesh.renderOrder = 4
  glowPointsMesh.visible = (params.dotSize ?? 0) > 0 && (params.dotGlow ?? 0) > 0
  scene.add(glowPointsMesh)

  // 7. Ping-Pong Render Targets for Feedback Loop Pass
  const initWidth = Math.max(1, Math.round(canvas.clientWidth * dpr))
  const initHeight = Math.max(1, Math.round(canvas.clientHeight * dpr))
  let sceneRenderTarget: THREE.WebGLRenderTarget | null = null
  let feedbackTargetA: THREE.WebGLRenderTarget | null = null
  let feedbackTargetB: THREE.WebGLRenderTarget | null = null

  try {
    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      samples: 4,
    }
    sceneRenderTarget = new THREE.WebGLRenderTarget(initWidth, initHeight, rtOptions)
    feedbackTargetA = new THREE.WebGLRenderTarget(initWidth, initHeight, { ...rtOptions, samples: 0 })
    feedbackTargetB = new THREE.WebGLRenderTarget(initWidth, initHeight, { ...rtOptions, samples: 0 })
  } catch {
    // Non-WebGL environments fallback gracefully to direct rendering
  }

  const feedbackCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const feedbackScene = new THREE.Scene()
  const feedbackQuadGeo = new THREE.PlaneGeometry(2, 2)
  const feedbackMaterial = new THREE.ShaderMaterial({
    vertexShader: MESH_FEEDBACK_VERTEX_SHADER,
    fragmentShader: MESH_FEEDBACK_FRAGMENT_SHADER,
    uniforms: {
      tDiffuse: { value: null },
      tFeedback: { value: null },
      resolution: { value: new THREE.Vector2(initWidth, initHeight) },
      centerX: { value: 0.5 },
      centerY: { value: 0.5 },
      zoomFrame: { value: params.feedback_zoom ?? 1.01 },
      rotateFrame: { value: 0.0 },
      offsetFrame: { value: new THREE.Vector2(0, 0) },
      hueFrame: { value: 0.0 },
      decayFrame: { value: params.feedback_decay ?? 0.52 },
      injectFrame: { value: 1.0 },
      blendModeInt: {
        value:
          (params.feedback_blendMode ?? 'add') === 'add'
            ? 1
            : params.feedback_blendMode === 'mix'
              ? 2
              : 0,
      },
      opacity: { value: params.feedback_opacity ?? 1.0 },
    },
    depthTest: false,
    depthWrite: false,
  })
  const feedbackQuad = new THREE.Mesh(feedbackQuadGeo, feedbackMaterial)
  feedbackScene.add(feedbackQuad)

  // Screen blit scene to output final post-processed texture to canvas
  const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const blitScene = new THREE.Scene()
  const blitQuadGeo = new THREE.PlaneGeometry(2, 2)
  const blitMaterial = new THREE.MeshBasicMaterial({ map: null, transparent: false })
  const blitMesh = new THREE.Mesh(blitQuadGeo, blitMaterial)
  blitScene.add(blitMesh)

  // 5. 240-frame Waterfall History Cascade Buffer
  const RING_BUFFER_FRAMES = 240
  let audioHistoryBuffer: Uint8Array | null = null
  let historyTime = 0
  let historyLastFrame = -1
  // er = 3 / 240 (0.0125 seconds per frame)
  const FRAME_STEP = 3 / 240

  let elapsedTime = 0
  const halfX = (gridSizeX - 1) / 2
  const halfY = (gridSizeY - 1) / 2
  const maxRadius = Math.sqrt(halfX * halfX + halfY * halfY)
  const invMaxRadius = maxRadius > 0 ? 1 / maxRadius : 0

  /**
   * Set theme colors extracted from album cover.
   * This is called ONLY when the song changes, never on every render frame!
   */
  const setAlbumTheme = (palette: ExtractedPalette | null) => {
    if (palette && (palette.accent || palette.surface || palette.background)) {
      const accent = palette.accent ?? { r: 0, g: 255, b: 180 }
      const surface = palette.surface ?? palette.accent
      const edge = palette.edge ?? palette.background ?? { r: 35, g: 20, b: 65 }

      // 1. Low color (outer mesh calm wireframe): deep, rich album atmosphere
      const lowR = (edge.r / 255) * 0.35 + (surface.r / 255) * 0.15
      const lowG = (edge.g / 255) * 0.35 + (surface.g / 255) * 0.15
      const lowB = (edge.b / 255) * 0.35 + (surface.b / 255) * 0.15

      uLowColor.setRGB(
        Math.max(0.02, Math.min(0.60, lowR)),
        Math.max(0.02, Math.min(0.60, lowG)),
        Math.max(0.02, Math.min(0.60, lowB)),
      )

      // 2. Mid color (mid-height slope): rich blend of surface and accent
      uMidColor.setRGB(
        Math.min(1.0, (surface.r / 255) * 0.85 + (accent.r / 255) * 0.25),
        Math.min(1.0, (surface.g / 255) * 0.85 + (accent.g / 255) * 0.25),
        Math.min(1.0, (surface.b / 255) * 0.85 + (accent.b / 255) * 0.25),
      )

      // 3. High color (crest wave ridges): blazing vibrant hero accent of the album with boosted saturation
      const accR = accent.r / 255
      const accG = accent.g / 255
      const accB = accent.b / 255
      const maxA = Math.max(accR, accG, accB, 0.01)
      const minA = Math.min(accR, accG, accB)
      const spanA = maxA - minA
      // Expand chroma range so bright accents retain rich, deep colour instead of desaturating into white
      const satR = spanA > 0.02 ? (accR - minA * 0.4) / (maxA - minA * 0.4) : accR
      const satG = spanA > 0.02 ? (accG - minA * 0.4) / (maxA - minA * 0.4) : accG
      const satB = spanA > 0.02 ? (accB - minA * 0.4) / (maxA - minA * 0.4) : accB
      uHighColor.setRGB(
        Math.min(1.0, Math.max(0.0, satR)),
        Math.min(1.0, Math.max(0.0, satG)),
        Math.min(1.0, Math.max(0.0, satB)),
      )

      // 4. Angle color wheel hues (smooth blend across album tones)
      uAngleColor1.setRGB(accent.r / 255, accent.g / 255, accent.b / 255)
      uAngleColor2.setRGB(surface.r / 255, surface.g / 255, surface.b / 255)
      // Complementary/harmonic third angle: subtle shift
      uAngleColor3.setRGB(
        Math.min(1.0, (accent.g / 255) * 0.6 + (surface.b / 255) * 0.4),
        Math.min(1.0, (accent.b / 255) * 0.6 + (surface.r / 255) * 0.4),
        Math.min(1.0, (accent.r / 255) * 0.6 + (surface.g / 255) * 0.4),
      )

      // 5. Starfield tinted highlights
      starColor.setRGB(
        0.85 + (accent.r / 255) * 0.15,
        0.85 + (accent.g / 255) * 0.15,
        0.85 + (accent.b / 255) * 0.15,
      )

      starfieldMaterial.uniforms.uColor1.value.setRGB(0, 0, 0)
      baseColor.set(0x000000)
      uHasPalette.value = params.useAlbumPalette ? 1.0 : 0.0
    } else {
      // Fallback
      baseColor.set(0x000000)
      starColor.set(0xffffff)
      starfieldMaterial.uniforms.uColor1.value.set(0x000000)
      uHasPalette.value = 0.0
    }

    wireframeMaterial.uniforms.baseColor.value = baseColor
    wireframeMaterial.uniforms.uLowColor.value = uLowColor
    wireframeMaterial.uniforms.uMidColor.value = uMidColor
    wireframeMaterial.uniforms.uHighColor.value = uHighColor
    wireframeMaterial.uniforms.uAngleColor1.value = uAngleColor1
    wireframeMaterial.uniforms.uAngleColor2.value = uAngleColor2
    wireframeMaterial.uniforms.uAngleColor3.value = uAngleColor3
    wireframeMaterial.uniforms.uHasPalette.value = uHasPalette.value

    fillMaterial.uniforms.baseColor.value = baseColor
    fillMaterial.uniforms.uLowColor.value = uLowColor
    fillMaterial.uniforms.uMidColor.value = uMidColor
    fillMaterial.uniforms.uHighColor.value = uHighColor
    fillMaterial.uniforms.uAngleColor1.value = uAngleColor1
    fillMaterial.uniforms.uAngleColor2.value = uAngleColor2
    fillMaterial.uniforms.uAngleColor3.value = uAngleColor3
    fillMaterial.uniforms.uHasPalette.value = uHasPalette.value
    starfieldMaterial.uniforms.uColor2.value = starColor

    solidPointsMaterial.uniforms.baseColor.value = baseColor
    glowPointsMaterial.uniforms.baseColor.value = baseColor
  }

  /**
   * 60fps Frame Update.
   * Strictly avoids color extraction or palette recalculation.
   */
  const updateFrame = (
    dt: number,
    freqData: Uint8Array,
    bassEnergy: number,
    midEnergy: number,
  ) => {
    elapsedTime += dt * params.waveSpeed
    const binCount = freqData.length

    // Update inertial camera damping
    controls.update()

    // Compute exact bass energy eu and mid energy ec
    const eo = Math.max(1, Math.floor(0.1 * binCount))
    const en = Math.max(eo + 1, Math.floor(0.5 * binCount))
    let el = 0
    for (let e = 0; e < eo; e++) el += freqData[e]
    let es = 0
    for (let e = eo; e < en; e++) es += freqData[e]
    const eu = el / (0.1 * binCount) / 255
    const ec = es / (0.4 * binCount) / 255

    // 1. Manage 240-frame Waterfall ring buffer
    if (!audioHistoryBuffer || audioHistoryBuffer.length !== RING_BUFFER_FRAMES * binCount) {
      audioHistoryBuffer = new Uint8Array(RING_BUFFER_FRAMES * binCount)
      historyTime = 0
      historyLastFrame = -1
    }

    historyTime += dt
    const currentFrame = Math.floor(historyTime / FRAME_STEP)
    if (currentFrame > historyLastFrame) {
      const startF = Math.max(historyLastFrame + 1, currentFrame - RING_BUFFER_FRAMES + 1)
      for (let f = startF; f <= currentFrame; f++) {
        const offset = (f % RING_BUFFER_FRAMES) * binCount
        for (let b = 0; b < binCount; b++) {
          audioHistoryBuffer[offset + b] = freqData[b]
        }
      }
      historyLastFrame = currentFrame
    }

    const historyDelayFrames = RING_BUFFER_FRAMES * params.flowMix
    const effectiveFrame = Math.min(RING_BUFFER_FRAMES - 1, currentFrame)

    // Update uniform values
    wireframeMaterial.uniforms.time.value = elapsedTime
    wireframeMaterial.uniforms.colorIntensity.value = params.colorIntensity
    wireframeMaterial.uniforms.colorReactivity.value = params.colorReactivity
    wireframeMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
    wireframeMaterial.uniforms.angleHueMix.value = params.angleHueMix

    if (fillMesh.visible) {
      fillMaterial.uniforms.time.value = elapsedTime
      fillMaterial.uniforms.colorIntensity.value = params.colorIntensity
      fillMaterial.uniforms.colorReactivity.value = params.colorReactivity
      fillMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
      fillMaterial.uniforms.angleHueMix.value = params.angleHueMix
    }

    if (solidPointsMesh.visible) {
      solidPointsMaterial.uniforms.time.value = elapsedTime
      solidPointsMaterial.uniforms.colorIntensity.value = params.colorIntensity
      solidPointsMaterial.uniforms.colorReactivity.value = params.colorReactivity
      solidPointsMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
      solidPointsMaterial.uniforms.angleHueMix.value = params.angleHueMix
      solidPointsMaterial.uniforms.dotSize.value = params.dotSize
      solidPointsMaterial.uniforms.dotReactivity.value = params.dotReactivity
    }

    if (glowPointsMesh.visible) {
      glowPointsMaterial.uniforms.time.value = elapsedTime
      glowPointsMaterial.uniforms.colorIntensity.value = params.colorIntensity
      glowPointsMaterial.uniforms.colorReactivity.value = params.colorReactivity
      glowPointsMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
      glowPointsMaterial.uniforms.angleHueMix.value = params.angleHueMix
      glowPointsMaterial.uniforms.dotSize.value = params.dotSize
      glowPointsMaterial.uniforms.dotReactivity.value = params.dotReactivity
      glowPointsMaterial.uniforms.dotGlow.value = params.dotGlow
    }

    // Apply smooth idle camera rotation around vertical axis when user is not dragging
    if (params.cameraRotationY) {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), params.cameraRotationY * (60 * dt))
      camera.lookAt(controls.target)
    }
    if (params.cameraAutoPitch && params.cameraAutoPitch > 0) {
      const pitchWave = Math.sin(elapsedTime * 0.9) * params.cameraAutoPitch * 10 * dt
      camera.position.y += pitchWave
      camera.lookAt(controls.target)
    }

    // Update procedural starfield uniforms (reacts to bass energy eu)
    starfieldMaterial.uniforms.uTime.value = elapsedTime
    starfieldMaterial.uniforms.uAudioValue.value = eu

    // Compute complete vertex displacement loop
    const posArr = geometry.attributes.position.array as Float32Array
    const zParam = params.waveComplexity
    const jaggedness = params.jaggedness

    // Motion dampening rate: A * (1 - 0.5 * jaggedness)
    const rDamp = params.dampeningFactor * (1 - 0.5 * jaggedness)
    const dampAlpha = 1 - Math.pow(rDamp, Math.min(dt * 60, 2))
    const O = params.radialMix
    const s = params.waveHeight
    const X = params.sensitivity ?? 1.0
    const perlinIntensity = params.perlinNoiseIntensity ?? 0.0
    const perlinScale = params.perlinNoiseScale ?? 0.01
    const perlinSpeed = params.perlinNoiseSpeed ?? 0.0

    // Central Mountain parameters
    const mountainPeak = params.centerMountainHeight ?? 0
    const mountainRadius = Math.max(0.05, params.centerMountainRadius ?? 0.32)
    const mountainSharpness = Math.max(0.4, params.centerMountainSharpness ?? 2.0)
    const mountainReactivity = params.centerMountainAudioReactivity ?? 1.0
    const centerSpireReactivity = Math.max(0.2, params.centerSpireReactivity ?? 1.8)
    const peakCount = Math.max(1, Math.min(9, Math.round(params.mountainPeakCount ?? 1)))
    const peakSpread = Math.max(0.1, Math.min(1.0, params.mountainPeakSpread ?? 0.52))
    const ridgeDetail = Math.max(0.0, Math.min(1.0, params.mountainRidgeDetail ?? 0.35))
    const baseBedrockRatio = Math.max(0.0, Math.min(1.0, params.centerMountainBaseHeight ?? 0.28))
    const mountainRef = mountainPeak > 0 ? mountainPeak * 1.25 : 0
    const heightRef = Math.max(0.5, (s * X * 1.8 + mountainRef) * (params.heightColorScale ?? 1.0))
    const flowDir = params.flowDirection ?? (mountainPeak > 0 ? 'mountain-down' : 'radial')
    const activeBinCount = Math.max(16, Math.floor(binCount * 0.45))
    const centerBass = Math.max(eu, (freqData[0] ?? 0) / 255, (freqData[1] ?? 0) / 255, (freqData[2] ?? 0) / 255)

    // Precalculate satellite peak positions and dynamic audio energies once per frame
    // Satellite peaks surround the central summit, each reacting to distinct harmonic frequency bands
    const satellitePeaks: Array<{
      nx: number
      ny: number
      radius: number
      height: number
      energy: number
    }> = []

    if (mountainPeak > 0 && peakCount > 1) {
      const satCount = peakCount - 1
      for (let k = 0; k < satCount; k++) {
        const satAngle = (k / satCount) * 2 * Math.PI + 0.35
        const satDist = mountainRadius * peakSpread * 0.50
        const satNx = Math.cos(satAngle) * satDist
        const satNy = Math.sin(satAngle) * satDist
        // Distribute frequency bands evenly across the active spectrum for satellite spires
        const bandIdx = Math.min(
          activeBinCount - 1,
          Math.max(1, Math.floor(((k + 1) / (satCount + 1)) * activeBinCount)),
        )
        const satAudio = (freqData[bandIdx] ?? 0) / 255
        const satEnergy = (satAudio * 0.45 + ec * 0.20) * mountainReactivity
        const satHeight = mountainPeak * 0.72 * (baseBedrockRatio * 0.70 + satEnergy)
        const satRadius = mountainRadius * 0.40
        satellitePeaks.push({
          nx: satNx,
          ny: satNy,
          radius: satRadius,
          height: satHeight,
          energy: satEnergy,
        })
      }
    }

    for (let i = 0; i < vertexCount; i++) {
      const origY = basePositions[3 * i + 1]
      const col = i % gridSizeX
      const row = Math.floor(i / gridSizeX)
      const dx = col - halfX
      const dy = row - halfY
      const distNorm = Math.min(Math.sqrt(dx * dx + dy * dy) * invMaxRadius, 1)
      const angle = Math.atan2(dy, dx)
      const normAngle = (angle + Math.PI) / (2 * Math.PI)

      // Wave flow coordinate:
      // 'mountain-down' or 'radial': waves originate at the mountain summit (distNorm = 0)
      // and cascade DOWN the slopes toward the base (distNorm = 1)!
      let flowCoord = distNorm
      if (flowDir === 'top-down') {
        flowCoord = row / (gridSizeY - 1)
      } else if (flowDir === 'bottom-up') {
        flowCoord = 1.0 - (row / (gridSizeY - 1))
      }

      // Smooth concentric frequency lookup index for base ripples across the dome
      const spreadPow = 1 + 2 * (params.spectrumSpread ?? 0)
      const effDist = (params.spectrumSpread ?? 0) > 0 ? Math.pow(flowCoord, spreadPow) : flowCoord
      const freqIdx = Math.min(Math.floor(effDist * (binCount - 1)), binCount - 1)

      // Waterfall history delay lookup (propagating wave cascade)
      let historyOffset = -1
      if (params.flowMix > 0) {
        const delay = Math.min(Math.floor(flowCoord * historyDelayFrames), effectiveFrame)
        if (delay > 0) {
          historyOffset = ((currentFrame - delay + RING_BUFFER_FRAMES) % RING_BUFFER_FRAMES) * binCount
        }
      }

      let audioSample =
        historyOffset >= 0
          ? audioHistoryBuffer[historyOffset + freqIdx] / 255
          : (freqData[freqIdx] ?? 0) / 255

      // Spectrum spiral if active
      if (params.spectrumSpiral > 0) {
        let spiralNorm = (distNorm * params.spiralTurns + normAngle) % 1
        if ((params.spectrumSpread ?? 0) > 0) {
          spiralNorm = Math.pow(spiralNorm, spreadPow)
        }
        const spiralIdx = Math.min(Math.floor(spiralNorm * (binCount - 1)), binCount - 1)
        const spiralSample =
          historyOffset >= 0
            ? audioHistoryBuffer[historyOffset + spiralIdx] / 255
            : (freqData[spiralIdx] ?? 0) / 255
        audioSample += (spiralSample - audioSample) * params.spectrumSpiral
      }

      let L = 0
      let maxPeakBell = 0
      const w = audioSample
      let C = 0
      let M = 0
      let k = 0

      if (mountainPeak > 0) {
        // 1. Dynamic Audio-Sculpted Alpine Massif:
        // The mountain's spires, cols, and arêtes are sculpted in real time by the audio spectrum.
        // Every song and every frame produces a completely unique mountain topography!
        let mountainElevation = 0
        const rNormMtn = distNorm / mountainRadius

        if (rNormMtn < 1.0) {
          // Circumferential Fourier spectral sampling: chords and melodies dynamically carve ridges
          const band1Idx = Math.min(activeBinCount - 1, Math.floor(normAngle * activeBinCount))
          const band2Idx = (band1Idx * 2) % activeBinCount
          const band3Idx = (band1Idx * 3) % activeBinCount
          const a1 = (freqData[band1Idx] ?? 0) / 255
          const a2 = (freqData[band2Idx] ?? 0) / 255
          const a3 = (freqData[band3Idx] ?? 0) / 255
          const spectralSculpt = (a1 * 0.45 + a2 * 0.25 + a3 * 0.15) * mountainReactivity

          // Gentle alpine foundation with concave talus slope
          const baseSlope = Math.pow(1.0 - rNormMtn, 1.8)
          const baseFoundation = mountainPeak * 0.20 * baseBedrockRatio * baseSlope

          // Central Summit Spire: specifically elevated reactivity focused right at the center epicenter!
          const summitSpireProfile = Math.pow(1.0 - rNormMtn, mountainSharpness)
          const centerAudioSurge =
            (Math.pow(centerBass, 0.85) * 0.95 + ec * 0.25) * mountainReactivity * centerSpireReactivity
          const summitHeight =
            mountainPeak *
            (baseBedrockRatio * 0.65 + centerAudioSurge) *
            summitSpireProfile

          // Spectral ridges sculpted by active harmonic frequencies
          const ridgeProfile = Math.pow(1.0 - rNormMtn, mountainSharpness * 0.8)
          const dynamicSpire = mountainPeak * (baseBedrockRatio * 0.65 + spectralSculpt * 0.40) * ridgeProfile

          // Combine central spire with satellite peaks
          let maxSpire = Math.max(summitHeight, dynamicSpire)
          let peakBellAcc = Math.max(summitSpireProfile, spectralSculpt * ridgeProfile)

          // Satellite peaks: spires erupting at satellite positions
          if (satellitePeaks.length > 0) {
            const vNormX = dx * invMaxRadius
            const vNormY = dy * invMaxRadius
            for (let sp = 0; sp < satellitePeaks.length; sp++) {
              const sat = satellitePeaks[sp]
              const sddx = vNormX - sat.nx
              const sddy = vNormY - sat.ny
              const satDist = Math.sqrt(sddx * sddx + sddy * sddy)
              const satRNorm = satDist / sat.radius
              if (satRNorm < 1.0) {
                const satProfile = Math.pow(1.0 - satRNorm, mountainSharpness * 1.15)
                const satElev = sat.height * satProfile
                if (satElev > maxSpire) {
                  maxSpire = satElev
                }
                peakBellAcc = Math.max(peakBellAcc, satProfile * (sat.energy * 0.6 + 0.4))
              }
            }
          }

          // Arête ridge cragginess connecting peaks
          let ridgeAddition = 0
          if (ridgeDetail > 0 && peakCount > 1) {
            const satCount = peakCount - 1
            const ridgeOsc = Math.cos(normAngle * satCount * Math.PI)
            const ridgeTerm = Math.pow(Math.abs(ridgeOsc), 2.5) * ridgeDetail
            ridgeAddition = mountainPeak * 0.12 * ridgeTerm * baseSlope * (eu * 0.4 + 0.2)
          }

          mountainElevation = baseFoundation + maxSpire + ridgeAddition
          maxPeakBell = peakBellAcc
        }

        // 2. Cascading Waves flowing DOWN from the mountain summit:
        // DistNorm = 0 is the peak; as time advances, wavePhase propagates outward (distNorm increases)!
        // Physical wave equation: phase = (k * distNorm - omega * t)
        const waveSpeed = params.waveSpeed * 3.2
        const wavePhase1 = 16.0 * distNorm - waveSpeed * elapsedTime
        const wavePhase2 = 28.0 * distNorm - waveSpeed * 1.5 * elapsedTime
        const waveCrest = Math.cos(wavePhase1) * (audioSample * 0.85 + centerBass * 0.55) + Math.cos(wavePhase2) * ec * 0.25
        const cascadingWave = waveCrest * s * X * 1.35

        L = mountainElevation + cascadingWave
      } else {
        // Standard harmonic signals and wave displacement for Preset 14 and all numbered presets
        if (O > 0) {
          const eHarmonic = Math.pow(zParam, 0.7)
          C = 0.3 * Math.sin(4 * angle + elapsedTime) * jaggedness * O
          if (zParam > 0.3) C += 0.2 * Math.sin(8 * angle - 1.5 * elapsedTime) * jaggedness * O * ((zParam - 0.3) / 0.7)
          if (zParam > 0.6) C += 0.15 * Math.sin(12 * angle + 0.7 * elapsedTime) * jaggedness * O * ((zParam - 0.6) / 0.4)
          M = Math.sin((Math.floor(normAngle * (4 + 8 * eHarmonic)) / (4 + 8 * eHarmonic)) * Math.PI * (8 + 16 * eHarmonic)) * jaggedness * 0.2 * O
        }

        if (O < 1) {
          k = (0.3 * Math.sin(4 * angle + 2 * elapsedTime) + 0.3 * Math.sin(6 * distNorm - 1.5 * elapsedTime)) * w * (1 - O)
          if (zParam > 0.2) {
            const tMix = Math.min(1, (zParam - 0.2) / 0.8)
            k += (0.4 * Math.sin(8 * distNorm - 2 * angle + elapsedTime) * tMix + 0.4 * Math.sin(6 * angle + 5 * distNorm - 1.2 * elapsedTime) * tMix) * w * (1 - O)
          }
          if (zParam > 0.4) {
            const tMix = Math.min(1, (zParam - 0.4) / 0.6)
            k += (Math.sin(3 * angle - 1.5 * elapsedTime) * ec * 0.6 * tMix + Math.sin(2 * angle + 4 * distNorm - 2.5 * elapsedTime) * (eu + ec) * 0.5 * tMix) * (1 - O)
          }
        }

        let R = 0
        if (O > 0) {
          const eHarmonic = zParam > 0.5 ? Math.floor(10 * distNorm) / 10 : distNorm
          R = audioSample * (1 + eu) * 1.5 * O
          if (zParam > 0.3) {
            const tMix = Math.min(1, (zParam - 0.3) / 0.7)
            const sinA = 8 * eHarmonic - elapsedTime
            R += (Math.sin(sinA) > 0 ? 1 : -1) * Math.pow(Math.abs(Math.sin(sinA)), 0.5) * eu * jaggedness * 0.8 * tMix * O
          }
          if (zParam > 0.5) {
            const tMix = Math.min(1, (zParam - 0.5) / 0.5)
            R += Math.sin(3 * angle + 2 * elapsedTime) * ec * jaggedness * 0.4 * tMix * O
          }
          if (zParam > 0.7) {
            const tMix = Math.min(1, (zParam - 0.7) / 0.3)
            R += Math.sin(15 * distNorm - 6 * eu - 2 * elapsedTime) * eu * 0.8 * tMix * O
          }
        }

        let E = 0
        if (O < 1) {
          const dirWeight = 1 - O
          E = audioSample * (1 + eu) * 1.5 * dirWeight
          if (zParam > 0.2) {
            const tMix = Math.min(1, (zParam - 0.2) / 0.8)
            E += Math.sin(8 * distNorm - 2 * elapsedTime) * eu * 0.8 * tMix * dirWeight
          }
          if (zParam > 0.4) {
            const tMix = Math.min(1, (zParam - 0.4) / 0.6)
            E += (Math.sin(3 * angle - 1.5 * elapsedTime) * ec * 0.6 * tMix + Math.sin(2 * angle + 4 * distNorm - 2.5 * elapsedTime) * (eu + ec) * 0.5 * tMix) * dirWeight
          }
          if (zParam > 0.6) {
            const tMix = Math.min(1, (zParam - 0.6) / 0.4)
            E += (Math.sin(10 * distNorm) * Math.sin(4 * angle) * eu * 0.7 * tMix + Math.sin(15 * distNorm - 3 * elapsedTime) * ec * 0.5 * tMix) * dirWeight
          }
          if (zParam > 0.8) {
            const tMix = Math.min(1, (zParam - 0.8) / 0.2)
            E += 0.2 * Math.sin(8 * angle + 20 * distNorm + 0.5 * elapsedTime) * tMix * dirWeight
          }
        }

        L = (R + E) * s * X
      }

      if (perlinIntensity > 0) {
        const noiseVal = 2 * perlin3d(col * perlinScale, row * perlinScale, elapsedTime * perlinSpeed) - 1
        L += noiseVal * perlinIntensity * s
      }

      if (jaggedness > 0.1) {
        const eSteps = Math.max(3, Math.floor(20 * (1 - jaggedness)))
        L = Math.floor(L * eSteps) / eSteps
      }

      // Exponential motion dampening (f.lH)
      const smoothed = prevHeights[i] + (L - prevHeights[i]) * dampAlpha
      prevHeights[i] = smoothed

      // Exact acoustic harmonic frequency T driving the shader colors and alpha
      let T = w + C + M + k
      if (maxPeakBell > 0) {
        T += maxPeakBell * (eu * 0.8 + 0.25)
      }
      if (jaggedness > 0.1) {
        const eSteps = Math.max(2, Math.floor(8 * (1 - jaggedness)))
        T = Math.floor(T * eSteps) / eSteps
      }
      frequencies[i] = Math.min(1.0, Math.max(0.0, T))

      // Normalized physical elevation (pure vertical height of wave ripples & mountain above baseline)
      elevations[i] = Math.min(1.0, Math.max(0.0, smoothed / heightRef))

      // Parabolic bowl/dome mesh bend (meshBend = -12 creates the crater center and elevated arched horizon)
      const bendElev = params.meshBend * (1 - distNorm * distNorm * 2)
      const finalY = origY + bendElev + smoothed

      // Configurable sphere wrapping: transforms planar grid into sphere (-360 to 360 degrees)
      const sphereWrap = params.sphereWrap ?? 0
      if (sphereWrap !== 0) {
        const sphereRad = (sphereWrap * Math.PI) / 180.0
        const phi = distNorm * sphereRad
        const sphereRadius = params.sphereRadius ?? 45.0
        const rEff = sphereRadius + (bendElev + smoothed) * 0.65

        posArr[3 * i] = rEff * Math.sin(phi) * Math.cos(angle)
        posArr[3 * i + 1] = rEff * Math.cos(phi) - sphereRadius
        posArr[3 * i + 2] = rEff * Math.sin(phi) * Math.sin(angle)
      } else {
        posArr[3 * i] = basePositions[3 * i]
        posArr[3 * i + 1] = finalY
        posArr[3 * i + 2] = basePositions[3 * i + 2]
      }
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.frequency.needsUpdate = true
    geometry.attributes.elevation.needsUpdate = true

    // Render with Ping-Pong Feedback Loop (signature echo trails) or direct fallback
    if (params.feedback_enabled && sceneRenderTarget && feedbackTargetA && feedbackTargetB) {
      // 1. Render main 3D scene into sceneRenderTarget
      renderer.setRenderTarget(sceneRenderTarget)
      renderer.render(scene, camera)

      // 2. Compute frame-rate independent feedback attenuation
      const n = 60 * dt
      const l = params.feedback_decay ?? 0.52
      const s = Math.pow(l, n)
      feedbackMaterial.uniforms.decayFrame.value = s
      feedbackMaterial.uniforms.injectFrame.value = l > 0.9995 ? n : (1 - s) / (1 - l)
      feedbackMaterial.uniforms.zoomFrame.value = Math.pow(params.feedback_zoom ?? 1.01, n)
      feedbackMaterial.uniforms.rotateFrame.value = THREE.MathUtils.degToRad(params.feedback_rotate ?? 0) * dt
      feedbackMaterial.uniforms.offsetFrame.value.set(
        (params.feedback_offsetX ?? 0) * dt,
        (params.feedback_offsetY ?? 0) * dt,
      )
      feedbackMaterial.uniforms.hueFrame.value = THREE.MathUtils.degToRad(params.feedback_hueShift ?? 0) * dt
      const blendMode = params.feedback_blendMode ?? 'add'
      feedbackMaterial.uniforms.blendModeInt.value = blendMode === 'add' ? 1 : blendMode === 'mix' ? 2 : 0
      feedbackMaterial.uniforms.opacity.value = params.feedback_opacity ?? 1.0

      feedbackMaterial.uniforms.tDiffuse.value = sceneRenderTarget.texture
      feedbackMaterial.uniforms.tFeedback.value = feedbackTargetA.texture

      // 3. Render feedback blend to feedbackTargetB
      renderer.setRenderTarget(feedbackTargetB)
      renderer.render(feedbackScene, feedbackCamera)

      // 4. Output final post-processed texture to canvas screen
      renderer.setRenderTarget(null)
      blitMaterial.map = feedbackTargetB.texture
      renderer.render(blitScene, blitCamera)

      // 5. Swap ping-pong targets
      const tempTarget = feedbackTargetA
      feedbackTargetA = feedbackTargetB
      feedbackTargetB = tempTarget
    } else {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    }
  }

  const setParams = (newParams: Partial<MeshGridParams>, options?: { updateCamera?: boolean }) => {
    Object.assign(params, newParams)

    if (newParams.cameraFov !== undefined) {
      params.cameraFov = newParams.cameraFov
      camera.fov = newParams.cameraFov
      camera.updateProjectionMatrix()
    }
    if (newParams.cameraDamping !== undefined) {
      params.cameraDamping = newParams.cameraDamping
      controls.dampingFactor = newParams.cameraDamping
    }
    if (newParams.cameraAutoPitch !== undefined) {
      params.cameraAutoPitch = newParams.cameraAutoPitch
    }
    if (newParams.lockCameraOnPresetChange !== undefined) {
      params.lockCameraOnPresetChange = newParams.lockCameraOnPresetChange
    }

    if (newParams.colorByHeight !== undefined) {
      params.colorByHeight = newParams.colorByHeight
      const val = newParams.colorByHeight ? 1.0 : 0.0
      uColorByHeight.value = val
      wireframeMaterial.uniforms.uColorByHeight.value = val
      fillMaterial.uniforms.uColorByHeight.value = val
      solidPointsMaterial.uniforms.uColorByHeight.value = val
      glowPointsMaterial.uniforms.uColorByHeight.value = val
    }
    if (newParams.heightColorScale !== undefined) {
      params.heightColorScale = newParams.heightColorScale
    }

    if (newParams.useAlbumPalette !== undefined) {
      params.useAlbumPalette = newParams.useAlbumPalette
      uHasPalette.value = newParams.useAlbumPalette ? 1.0 : 0.0
      wireframeMaterial.uniforms.uHasPalette.value = uHasPalette.value
      fillMaterial.uniforms.uHasPalette.value = uHasPalette.value
    }

    if (newParams.fillOpacity !== undefined) {
      fillMaterial.uniforms.surfaceOpacity.value = newParams.fillOpacity
      fillMesh.visible = newParams.fillOpacity > 0
    }
    if (newParams.fillReactivity !== undefined) {
      fillMaterial.uniforms.fillReactivity.value = newParams.fillReactivity
    }

    if (newParams.dotSize !== undefined) {
      params.dotSize = newParams.dotSize
      solidPointsMaterial.uniforms.dotSize.value = newParams.dotSize
      glowPointsMaterial.uniforms.dotSize.value = newParams.dotSize
      solidPointsMesh.visible = newParams.dotSize > 0
      glowPointsMesh.visible = newParams.dotSize > 0 && (params.dotGlow ?? 0) > 0
    }
    if (newParams.dotReactivity !== undefined) {
      params.dotReactivity = newParams.dotReactivity
      solidPointsMaterial.uniforms.dotReactivity.value = newParams.dotReactivity
      glowPointsMaterial.uniforms.dotReactivity.value = newParams.dotReactivity
    }
    if (newParams.dotGlow !== undefined) {
      params.dotGlow = newParams.dotGlow
      glowPointsMaterial.uniforms.dotGlow.value = newParams.dotGlow
      glowPointsMesh.visible = (params.dotSize ?? 0) > 0 && newParams.dotGlow > 0
    }

    if (newParams.feedback_enabled !== undefined) {
      params.feedback_enabled = newParams.feedback_enabled
    }
    if (newParams.feedback_decay !== undefined) {
      params.feedback_decay = newParams.feedback_decay
      if (feedbackMaterial.uniforms.decayFrame) {
        feedbackMaterial.uniforms.decayFrame.value = newParams.feedback_decay
      }
    }
    if (newParams.feedback_zoom !== undefined) {
      params.feedback_zoom = newParams.feedback_zoom
      if (feedbackMaterial.uniforms.zoomFrame) {
        feedbackMaterial.uniforms.zoomFrame.value = newParams.feedback_zoom
      }
    }
    if (newParams.feedback_blendMode !== undefined) {
      params.feedback_blendMode = newParams.feedback_blendMode
      if (feedbackMaterial.uniforms.blendModeInt) {
        feedbackMaterial.uniforms.blendModeInt.value =
          newParams.feedback_blendMode === 'add' ? 1 : newParams.feedback_blendMode === 'mix' ? 2 : 0
      }
    }
    if (newParams.feedback_opacity !== undefined) {
      params.feedback_opacity = newParams.feedback_opacity
      if (feedbackMaterial.uniforms.opacity) {
        feedbackMaterial.uniforms.opacity.value = newParams.feedback_opacity
      }
    }
    if (newParams.feedback_rotate !== undefined) {
      params.feedback_rotate = newParams.feedback_rotate
      if (feedbackMaterial.uniforms.rotateFrame) {
        feedbackMaterial.uniforms.rotateFrame.value = (newParams.feedback_rotate * Math.PI) / 180
      }
    }
    if (newParams.feedback_hueShift !== undefined) {
      params.feedback_hueShift = newParams.feedback_hueShift
      if (feedbackMaterial.uniforms.hueFrame) {
        feedbackMaterial.uniforms.hueFrame.value = (newParams.feedback_hueShift * Math.PI) / 180
      }
    }
    if (newParams.cameraRotationY !== undefined) {
      params.cameraRotationY = newParams.cameraRotationY
    }

    wireframeMaterial.uniforms.colorIntensity.value = params.colorIntensity
    wireframeMaterial.uniforms.colorReactivity.value = params.colorReactivity
    wireframeMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
    wireframeMaterial.uniforms.angleHueMix.value = params.angleHueMix
    wireframeMaterial.uniforms.fillReactivity.value = params.lineReactivity
    wireframeMaterial.uniforms.uColorLowCutoff.value = params.colorLowCutoff ?? 0.20
    wireframeMaterial.uniforms.uColorMidCutoff.value = params.colorMidCutoff ?? 0.60
    wireframeMaterial.uniforms.uColorApexCutoff.value = params.colorApexCutoff ?? 0.88
    wireframeMaterial.uniforms.uApexHighlight.value = params.apexHighlightIntensity ?? 1.0
    wireframeMaterial.uniforms.uBaselineAlpha.value = params.baselineWireframeAlpha ?? 0.85

    fillMaterial.uniforms.colorIntensity.value = params.colorIntensity
    fillMaterial.uniforms.colorReactivity.value = params.colorReactivity
    fillMaterial.uniforms.circleMode.value = params.circleShape ? 1 : 0
    fillMaterial.uniforms.angleHueMix.value = params.angleHueMix
    fillMaterial.uniforms.uColorLowCutoff.value = params.colorLowCutoff ?? 0.20
    fillMaterial.uniforms.uColorMidCutoff.value = params.colorMidCutoff ?? 0.60
    fillMaterial.uniforms.uColorApexCutoff.value = params.colorApexCutoff ?? 0.88
    fillMaterial.uniforms.uApexHighlight.value = params.apexHighlightIntensity ?? 1.0
    fillMaterial.uniforms.uBaselineAlpha.value = params.baselineWireframeAlpha ?? 0.85

    if (params.starfieldEnabled !== undefined) {
      starfieldMesh.visible = params.starfieldEnabled
    }
    if (params.starDensity !== undefined) {
      starfieldMaterial.uniforms.uStarDensity.value = params.starDensity
    }
    if (params.starTwinkleSpeed !== undefined) {
      starfieldMaterial.uniforms.uTwinkleSpeed.value = params.starTwinkleSpeed
    }
    if (params.starAudioReactivity !== undefined) {
      starfieldMaterial.uniforms.uAudioReactivity.value = params.starAudioReactivity
    }

    // Crucial: Only update Three.js camera position & target if updateCamera is explicitly requested.
    // Changing sliders or general parameters will NEVER snap or reset the active camera!
    if (newParams.cameraPosition) {
      params.cameraPosition = newParams.cameraPosition
      if (options?.updateCamera) {
        camera.position.set(newParams.cameraPosition.x, newParams.cameraPosition.y, newParams.cameraPosition.z)
      }
    }
    if (newParams.cameraTarget) {
      params.cameraTarget = newParams.cameraTarget
      if (options?.updateCamera) {
        controls.target.set(newParams.cameraTarget.x, newParams.cameraTarget.y, newParams.cameraTarget.z)
        camera.lookAt(newParams.cameraTarget.x, newParams.cameraTarget.y, newParams.cameraTarget.z)
        controls.update()
      }
    }
  }

  const resetParams = () => {
    setParams(DEFAULT_MESH_GRID_PARAMS)
  }

  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return
    const curDpr = renderer.getPixelRatio()
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)

    const targetW = Math.max(1, Math.round(width * curDpr))
    const targetH = Math.max(1, Math.round(height * curDpr))

    feedbackMaterial.uniforms.resolution.value.set(targetW, targetH)
    solidPointsMaterial.uniforms.uPixelRatio.value = curDpr
    glowPointsMaterial.uniforms.uPixelRatio.value = curDpr

    sceneRenderTarget?.setSize(targetW, targetH)
    feedbackTargetA?.setSize(targetW, targetH)
    feedbackTargetB?.setSize(targetW, targetH)
  }

  const dispose = () => {
    controls.dispose()
    geometry.dispose()
    wireframeMaterial.dispose()
    fillMaterial.dispose()
    solidPointsMaterial.dispose()
    glowPointsMaterial.dispose()
    starfieldGeo.dispose()
    starfieldMaterial.dispose()
    feedbackQuadGeo.dispose()
    feedbackMaterial.dispose()
    blitQuadGeo.dispose()
    blitMaterial.dispose()
    sceneRenderTarget?.dispose()
    feedbackTargetA?.dispose()
    feedbackTargetB?.dispose()
    renderer.dispose()
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    updateFrame,
    setAlbumTheme,
    setParams,
    setCamera,
    snapCameraTo,
    setCameraFov,
    resetParams,
    resetCamera,
    resize,
    dispose,
  }
}
