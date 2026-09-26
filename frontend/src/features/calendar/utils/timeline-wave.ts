/** Shared wave geometry so the axis path and beam anchors stay in sync. */

const WAVE_A = 6
const WAVE_B = 2.5
const LAMBDA_A = 420
const LAMBDA_B = 180

export function waveOffsetY(x: number): number {
  return (
    Math.sin((x / LAMBDA_A) * Math.PI * 2) * WAVE_A +
    Math.sin((x / LAMBDA_B) * Math.PI * 2 + 0.8) * WAVE_B
  )
}

/** Midline Y in the SVG viewBox (viewBox height is 120, mid = 60). */
export const WAVE_MID_Y = 60

/** Build a wave path for a horizontal slice starting at worldX `offsetX`. */
export function buildWavePath(width: number, offsetX = 0): string {
  if (width <= 0) return ''
  const step = width > 4000 ? 16 : width > 2000 ? 10 : 8
  const parts: string[] = []
  for (let x = 0; x <= width; x += step) {
    const y = WAVE_MID_Y + waveOffsetY(offsetX + x)
    parts.push(`${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(2)}`)
  }
  const endY = WAVE_MID_Y + waveOffsetY(offsetX + width)
  parts.push(`L ${width.toFixed(1)} ${endY.toFixed(2)}`)
  return parts.join(' ')
}

/** Deterministic pseudo-stars along a visible slice. */
export function buildStarField(
  width: number,
  count = 24,
  offsetX = 0
): { x: number; y: number; r: number; o: number }[] {
  const stars: { x: number; y: number; r: number; o: number }[] = []
  let seed = (Math.floor(offsetX / 80) * 16807 + 1) % 2147483647
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 0; i < count; i++) {
    const x = rand() * width
    const along = WAVE_MID_Y + waveOffsetY(offsetX + x)
    const y = along + (rand() - 0.5) * 16
    stars.push({
      x,
      y,
      r: 0.4 + rand() * 1.4,
      o: 0.25 + rand() * 0.55,
    })
  }
  return stars
}
