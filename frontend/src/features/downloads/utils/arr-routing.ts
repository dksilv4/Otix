import type { ArrServiceInstance } from '../arr-instances'

export interface MediaRoutingMetadata {
  title?: string | null
  genres?: string[] | null
  originalLanguage?: string | null
  isAnime?: boolean | null
  keywords?: string[] | null
}

export const POPULAR_ARR_ROUTING_TAGS = [
  'Anime',
  'Animation',
  'Japanese',
  '4K / UHD',
  'Documentary',
  'Kids / Family',
] as const

const ANIME_SYNONYMS = new Set(['anime', 'animation', 'japan', 'japanese', 'manga'])

/**
 * Checks whether an Arr instance's configured routing tags match the given media metadata.
 */
export const isInstanceMatchingMedia = (
  instance: ArrServiceInstance,
  media: MediaRoutingMetadata,
): boolean => {
  if (!instance.enabled || !instance.tags || instance.tags.length === 0) {
    return false
  }

  const normalizedTags = instance.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)
  if (normalizedTags.length === 0) return false

  const isAnime = Boolean(media.isAnime)
  const lang = (media.originalLanguage || '').toLowerCase().trim()
  const genres = (media.genres || []).map((g) => g.toLowerCase().trim())
  const keywords = (media.keywords || []).map((k) => k.toLowerCase().trim())
  const title = (media.title || '').toLowerCase().trim()

  for (const tag of normalizedTags) {
    // 1. Anime / Japan matching
    if (ANIME_SYNONYMS.has(tag)) {
      if (isAnime) return true
      if (lang === 'ja' || lang === 'jpn' || lang === 'japanese') return true
      if (genres.some((g) => g.includes('animation') || g.includes('anime'))) return true
      if (keywords.some((k) => k.includes('anime') || k.includes('manga'))) return true
    }

    // 2. 4K / UHD matching
    if (tag === '4k' || tag === 'uhd' || tag === '2160p' || tag === '4k / uhd') {
      if (title.includes('4k') || title.includes('uhd') || keywords.some((k) => k.includes('4k') || k.includes('uhd'))) {
        return true
      }
    }

    // 3. Genre matching
    if (genres.some((g) => g === tag || g.includes(tag) || tag.includes(g))) {
      return true
    }

    // 4. Keyword / title matching
    if (keywords.some((k) => k === tag || k.includes(tag))) {
      return true
    }
  }

  return false
}

/**
 * Evaluates configured Arr instances and returns the best matching instance based on routing tags.
 * If no instance matches specific tags, returns null so caller can fallback to default.
 */
export const findBestArrInstance = (
  instances: ArrServiceInstance[],
  media: MediaRoutingMetadata,
): ArrServiceInstance | null => {
  const ready = instances.filter((inst) => inst.enabled)
  if (ready.length === 0) return null

  // Score each instance by number of matched criteria
  let bestMatch: ArrServiceInstance | null = null
  let highestScore = 0

  for (const inst of ready) {
    if (!inst.tags || inst.tags.length === 0) continue

    let score = 0
    const normalizedTags = inst.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)

    const isAnime = Boolean(media.isAnime)
    const lang = (media.originalLanguage || '').toLowerCase().trim()
    const genres = (media.genres || []).map((g) => g.toLowerCase().trim())
    const keywords = (media.keywords || []).map((k) => k.toLowerCase().trim())

    for (const tag of normalizedTags) {
      if (ANIME_SYNONYMS.has(tag)) {
        if (isAnime) score += 3
        if (lang === 'ja' || lang === 'jpn') score += 2
        if (genres.some((g) => g.includes('animation'))) score += 2
      }
      if (genres.some((g) => g === tag || g.includes(tag))) {
        score += 2
      }
      if (keywords.some((k) => k === tag || k.includes(tag))) {
        score += 1
      }
    }

    if (score > highestScore) {
      highestScore = score
      bestMatch = inst
    }
  }

  return bestMatch
}
