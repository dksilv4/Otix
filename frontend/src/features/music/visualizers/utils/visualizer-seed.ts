import {
  type MeshGridParams,
  MESH_GRID_VARIANT_14_CONFIG,
} from './mesh-grid-helpers'

export const VISUALIZER_SEED_PREFIX = 'OTIX-VIZ-1:'

const safeBtoa = (str: string): string => {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(unescape(encodeURIComponent(str)))
  }
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(str, 'utf-8').toString('base64')
  }
  return btoa(unescape(encodeURIComponent(str)))
}

const safeAtob = (b64: string): string => {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    try {
      return decodeURIComponent(escape(window.atob(b64)))
    } catch {
      return window.atob(b64)
    }
  }
  if (typeof (globalThis as any).Buffer !== 'undefined') {
    return (globalThis as any).Buffer.from(b64, 'base64').toString('utf-8')
  }
  return atob(b64)
}

/**
 * Encodes visualizer 3D configuration parameters into an exportable, shareable seed code.
 */
export const generateVisualizerSeed = (params: MeshGridParams): string => {
  try {
    const jsonStr = JSON.stringify(params)
    const encoded = safeBtoa(jsonStr)
    return `${VISUALIZER_SEED_PREFIX}${encoded}`
  } catch (err) {
    console.error('[VisualizerSeed] Error generating visualizer seed:', err)
    return ''
  }
}

/**
 * Parses and validates an imported visualizer seed code (or raw JSON payload).
 * Merges decoded parameters cleanly with baseline defaults.
 */
export const parseVisualizerSeed = (input: string): MeshGridParams | null => {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()

  try {
    // 1. Check if raw JSON was pasted
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        return {
          ...MESH_GRID_VARIANT_14_CONFIG,
          ...parsed,
          cameraPosition: {
            ...MESH_GRID_VARIANT_14_CONFIG.cameraPosition,
            ...(parsed.cameraPosition || {}),
          },
          cameraTarget: {
            ...MESH_GRID_VARIANT_14_CONFIG.cameraTarget,
            ...(parsed.cameraTarget || {}),
          },
        }
      }
    }

    // 2. Extract base64 payload by stripping prefix
    let payload = trimmed.replace(/^(?:OTIX[-_]VIZ(?:[-_]\d+)?[:_]|VIZ[:_])/i, '')
    payload = payload.replace(/\s+/g, '')

    const decoded = safeAtob(payload)
    const parsed = JSON.parse(decoded)

    if (parsed && typeof parsed === 'object') {
      const knownKeys = [
        'gridSizeX',
        'waveHeight',
        'waveSpeed',
        'colorIntensity',
        'sphereWrap',
        'flowMix',
        'cameraPosition',
        'feedback_decay',
      ]
      const hasKnownKey = knownKeys.some((k) => k in parsed)
      if (hasKnownKey) {
        return {
          ...MESH_GRID_VARIANT_14_CONFIG,
          ...parsed,
          cameraPosition: {
            ...MESH_GRID_VARIANT_14_CONFIG.cameraPosition,
            ...(parsed.cameraPosition || {}),
          },
          cameraTarget: {
            ...MESH_GRID_VARIANT_14_CONFIG.cameraTarget,
            ...(parsed.cameraTarget || {}),
          },
        }
      }
    }
  } catch {
    // Invalid seed format
  }

  return null
}

/**
 * Procedurally generates a unique, harmonious random visualizer configuration and its corresponding seed.
 * Accepts optional overrides to respect user preferences (such as persistent album cover theme).
 */
export const generateRandomVisualizerSeed = (
  overrides?: Partial<MeshGridParams>,
): { seed: string; params: MeshGridParams } => {
  const directions: Array<'radial' | 'mountain-down' | 'top-down' | 'bottom-up'> = [
    'radial',
    'mountain-down',
    'top-down',
    'bottom-up',
  ]
  const blendModes: Array<'add' | 'mix' | 'max'> = ['add', 'mix', 'max']

  const randomDir = directions[Math.floor(Math.random() * directions.length)]
  const randomBlend = blendModes[Math.floor(Math.random() * blendModes.length)]

  const params: MeshGridParams = {
    ...MESH_GRID_VARIANT_14_CONFIG,
    waveHeight: parseFloat((0.4 + Math.random() * 1.6).toFixed(2)),
    waveSpeed: parseFloat((0.4 + Math.random() * 1.4).toFixed(2)),
    waveComplexity: parseFloat((0.2 + Math.random() * 0.8).toFixed(2)),
    colorIntensity: parseFloat((1.0 + Math.random() * 2.0).toFixed(2)),
    colorReactivity: parseFloat((0.5 + Math.random() * 1.5).toFixed(2)),
    dampeningFactor: parseFloat((0.3 + Math.random() * 0.6).toFixed(2)),
    jaggedness: parseFloat((Math.random() * 0.35).toFixed(2)),
    sphereWrap: Math.random() > 0.65 ? (Math.random() > 0.5 ? 180 : 360) : 0,
    flowMix: parseFloat((0.2 + Math.random() * 0.7).toFixed(2)),
    flowDirection: randomDir,
    angleHueMix: parseFloat((Math.random() * 0.8).toFixed(2)),
    dotSize: Math.random() > 0.5 ? parseFloat((0.2 + Math.random() * 1.0).toFixed(2)) : 0,
    dotGlow: Math.random() > 0.5 ? parseFloat((0.5 + Math.random() * 1.5).toFixed(2)) : 0,
    starfieldEnabled: Math.random() > 0.2,
    starDensity: parseFloat((1.0 + Math.random() * 2.5).toFixed(2)),
    starAudioReactivity: parseFloat((1.5 + Math.random() * 3.0).toFixed(2)),
    feedback_enabled: Math.random() > 0.1,
    feedback_decay: parseFloat((0.35 + Math.random() * 0.35).toFixed(2)),
    feedback_blendMode: randomBlend,
    feedback_zoom: parseFloat((1.0 + Math.random() * 0.03).toFixed(3)),
    feedback_hueShift: Math.random() > 0.5 ? Math.floor(Math.random() * 120 - 60) : 0,
    useAlbumPalette: Math.random() > 0.4,
    ...(overrides || {}),
  }

  const seed = generateVisualizerSeed(params)
  return { seed, params }
}
