import type { VisualizerMode } from '../types'
import {
  type MeshGridParams,
  MESH_GRID_VARIANT_14_CONFIG,
} from './mesh-grid-helpers'

export const VISUALIZER_PARAMS_KEY = 'otix_visualizer_mesh_params'
export const VISUALIZER_MODE_KEY = 'otix_visualizer_mode'

let cachedParams: MeshGridParams | null = null
let cachedMode: VisualizerMode | null = null

export const getSavedVisualizerParams = (): MeshGridParams => {
  if (cachedParams) {
    return { ...cachedParams }
  }

  if (typeof localStorage === 'undefined') {
    return { ...MESH_GRID_VARIANT_14_CONFIG }
  }

  try {
    const raw = localStorage.getItem(VISUALIZER_PARAMS_KEY)
    if (!raw) return { ...MESH_GRID_VARIANT_14_CONFIG }
    const parsed = JSON.parse(raw) as Partial<MeshGridParams>
    if (parsed && typeof parsed === 'object') {
      const merged: MeshGridParams = {
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
      cachedParams = merged
      return { ...merged }
    }
  } catch {
    // Ignore storage parse errors
  }

  return { ...MESH_GRID_VARIANT_14_CONFIG }
}

export const saveVisualizerParams = (params: MeshGridParams): void => {
  cachedParams = { ...params }
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(VISUALIZER_PARAMS_KEY, JSON.stringify(params))
  } catch {
    // Ignore storage quota errors
  }
}

export const getSavedVisualizerMode = (): VisualizerMode => {
  if (cachedMode) return cachedMode

  if (typeof localStorage === 'undefined') return 'mesh-grid'

  try {
    const raw = localStorage.getItem(VISUALIZER_MODE_KEY)
    if (raw === 'mesh-grid' || raw === 'spectrum-2d') {
      cachedMode = raw
      return raw
    }
  } catch {
    // Ignore storage parse errors
  }

  return 'mesh-grid'
}

export const saveVisualizerMode = (mode: VisualizerMode): void => {
  cachedMode = mode
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(VISUALIZER_MODE_KEY, mode)
  } catch {
    // Ignore storage quota errors
  }
}

export const clearSavedVisualizerSettings = (): void => {
  cachedParams = null
  cachedMode = null
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.removeItem(VISUALIZER_PARAMS_KEY)
    localStorage.removeItem(VISUALIZER_MODE_KEY)
  } catch {
    // Ignore storage quota errors
  }
}

export const PERSISTENT_PRESET_KEYS = [
  'useAlbumPalette',
  'sensitivity',
  'gain',
  'smoothingTimeConstant',
  'fftSize',
  'cameraDamping',
  'lockCameraOnPresetChange',
] as const

export type PersistentPresetKey = (typeof PERSISTENT_PRESET_KEYS)[number]

/**
 * Applies a preset configuration while preserving persistent user preference
 * and environmental calibration settings (such as album cover theme, audio
 * calibration, and camera orbit damping).
 */
export const applyPresetWithPersistentPreferences = (
  prevParams: MeshGridParams,
  presetParams: MeshGridParams,
): MeshGridParams => {
  const next: MeshGridParams = {
    ...presetParams,
    // Preserve persistent user preferences & audio calibration across presets
    useAlbumPalette:
      prevParams.useAlbumPalette !== undefined
        ? prevParams.useAlbumPalette
        : (presetParams.useAlbumPalette ?? false),
    sensitivity:
      prevParams.sensitivity !== undefined ? prevParams.sensitivity : presetParams.sensitivity,
    gain: prevParams.gain !== undefined ? prevParams.gain : presetParams.gain,
    smoothingTimeConstant:
      prevParams.smoothingTimeConstant !== undefined
        ? prevParams.smoothingTimeConstant
        : presetParams.smoothingTimeConstant,
    fftSize: prevParams.fftSize !== undefined ? prevParams.fftSize : presetParams.fftSize,
    cameraDamping:
      prevParams.cameraDamping !== undefined ? prevParams.cameraDamping : presetParams.cameraDamping,
    lockCameraOnPresetChange:
      prevParams.lockCameraOnPresetChange !== undefined
        ? prevParams.lockCameraOnPresetChange
        : presetParams.lockCameraOnPresetChange,
  }

  // If camera is locked on preset change, preserve the user's current 3D camera
  if (prevParams.lockCameraOnPresetChange) {
    next.cameraPosition = { ...prevParams.cameraPosition }
    next.cameraTarget = { ...prevParams.cameraTarget }
    if (prevParams.cameraFov !== undefined) {
      next.cameraFov = prevParams.cameraFov
    }
    next.lockCameraOnPresetChange = true
  }

  return next
}
