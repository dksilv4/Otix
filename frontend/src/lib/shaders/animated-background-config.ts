export type ShaderMode = 'idle' | 'active'
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra'

export const PROFILES = {
  idle: { fps: 28, scale: 0.58, streaks: 20, intensity: 1.3, speed: 1, shake: 0.0045 },
  active: { fps: 22, scale: 0.44, streaks: 12, intensity: 0.86, speed: 0.72, shake: 0.0026 },
}

export const QUALITY_PROFILES: Record<
  QualityTier,
  {
    antialias: boolean
    fpsBoost: number
    pixelRatioCap: number
    powerPreference: WebGLPowerPreference
    scaleBoost: number
    streakBoost: number
  }
> = {
  low: {
    antialias: false,
    fpsBoost: 0.82,
    pixelRatioCap: 0.9,
    powerPreference: 'default',
    scaleBoost: 0.82,
    streakBoost: 0.75,
  },
  medium: {
    antialias: false,
    fpsBoost: 1,
    pixelRatioCap: 1,
    powerPreference: 'default',
    scaleBoost: 1,
    streakBoost: 1,
  },
  high: {
    antialias: true,
    fpsBoost: 1.08,
    pixelRatioCap: 1.25,
    powerPreference: 'high-performance',
    scaleBoost: 1.18,
    streakBoost: 1.2,
  },
  ultra: {
    antialias: true,
    fpsBoost: 1.15,
    pixelRatioCap: 1.5,
    powerPreference: 'high-performance',
    scaleBoost: 1.3,
    streakBoost: 1.35,
  },
}

export const logFallback = (reason: string): void => {
  console.info(`[AnimatedShaderBackground] Falling back to gradients: ${reason}`)
}

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value))
}

export const resolveQualityTier = (input: {
  deviceMemory: number
  hardwareConcurrency: number
  maxTextureSize: number
  pixelRatio: number
  viewportArea: number
  webgl2: boolean
}): QualityTier => {
  let score = 0

  if (input.hardwareConcurrency >= 12) score += 2
  else if (input.hardwareConcurrency >= 8) score += 1
  else if (input.hardwareConcurrency <= 4) score -= 2

  if (input.deviceMemory >= 16) score += 2
  else if (input.deviceMemory >= 8) score += 1
  else if (input.deviceMemory <= 4) score -= 1

  if (input.webgl2) score += 1
  if (input.maxTextureSize >= 16384) score += 1
  else if (input.maxTextureSize <= 4096) score -= 1

  if (input.pixelRatio >= 2.5) score -= 1
  else if (input.pixelRatio <= 1.5) score += 1

  if (input.viewportArea >= 3840 * 2160) score -= 2
  else if (input.viewportArea >= 2560 * 1440) score -= 1

  if (score <= -1) return 'low'
  if (score <= 2) return 'medium'
  if (score <= 4) return 'high'
  return 'ultra'
}
