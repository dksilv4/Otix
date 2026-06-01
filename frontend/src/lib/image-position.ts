/** Encode position percentages into a URL fragment for storage alongside image URLs. */
export function encodePositionInUrl(url: string, x: number, y: number): string {
  // Round to 1 decimal for compactness; strip existing fragment first
  const base = url.split('#')[0]
  return `${base}#pos=${x.toFixed(1)},${y.toFixed(1)}`
}

/** Extract position percentages from a URL fragment. Returns null if no position found. */
export function parsePositionFromUrl(url: string): { x: number; y: number } | null {
  try {
    const hash = new URL(url).hash
    if (!hash.startsWith('#pos=')) return null
    const parts = hash.slice(5).split(',')
    if (parts.length !== 2) return null
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    if (isNaN(x) || isNaN(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

/** Strip position fragment from a URL, returning just the image URL. */
export function stripPositionFromUrl(url: string): string {
  return url.split('#')[0]
}
