import { useQueries } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

interface GenreOption {
  id: string
  name: string
  slug: string
}

export interface CuratedSectionConfig {
  id: string
  title: string
  mediaType: 'movie' | 'show'
  genre?: string
  isAnime?: boolean
  language?: string
}

const MEDIA_TYPES = ['movie', 'show'] as const
const GENRE_STALE_TIME = 24 * 60 * 60 * 1000 // 1 day

const SPECIAL_TRIGGERS: Record<string, CuratedSectionConfig[]> = {
  anime: [
    { id: 'curated-anime-movies', title: 'Popular Anime Movies', mediaType: 'movie', isAnime: true },
    { id: 'curated-anime-shows', title: 'Popular Anime Shows', mediaType: 'show', isAnime: true },
  ],
  korean: [
    { id: 'curated-korean-shows', title: 'Popular Korean Dramas', mediaType: 'show', language: 'ko' },
    { id: 'curated-korean-movies', title: 'Popular Korean Movies', mediaType: 'movie', language: 'ko' },
  ],
}

export function useCuratedSections(query: string): {
  sections: CuratedSectionConfig[]
  isLoading: boolean
} {
  const normalized = query.toLowerCase().trim()

  // Hooks must be called unconditionally — move the useQueries above the early return
  const genreQueries = useQueries({
    queries: MEDIA_TYPES.map((mediaType) => ({
      queryKey: ['genres', mediaType],
      queryFn: () =>
        apiClient.get<GenreOption[]>('/media/genres', { params: { media_type: mediaType } }).then((r) => r.data),
      staleTime: GENRE_STALE_TIME,
      enabled: normalized.length >= 2,
    })),
  })

  if (!normalized || normalized.length < 2) return { sections: [], isLoading: false }

  const isLoading = genreQueries.some((q) => q.isLoading)
  const genreData = genreQueries.map((q) => q.data ?? [])

  // Check special triggers
  const specialSections: CuratedSectionConfig[] = []
  for (const [keyword, sections] of Object.entries(SPECIAL_TRIGGERS)) {
    if (normalized.includes(keyword)) {
      for (const s of sections) {
        if (!specialSections.find((existing) => existing.id === s.id)) {
          specialSections.push(s)
        }
      }
    }
  }

  // Match query against genre names
  const genreSections: CuratedSectionConfig[] = []
  const seen = new Set<string>()

  for (let i = 0; i < MEDIA_TYPES.length; i++) {
    const mediaType = MEDIA_TYPES[i]
    const genres = genreData[i]

    for (const genre of genres) {
      const key = `${mediaType}-${genre.slug}`
      if (seen.has(key)) continue

      const genreName = genre.name.toLowerCase()
      const genreSlug = genre.slug.toLowerCase()

      // Match if query contains the genre name or slug
      if (normalized.includes(genreName) || normalized.includes(genreSlug)) {
        seen.add(key)
        genreSections.push({
          id: `curated-${mediaType}-${genre.slug}`,
          title: `Popular ${genre.name} ${mediaType === 'movie' ? 'Movies' : 'Shows'}`,
          mediaType,
          genre: genre.slug,
        })
      }
    }
  }

  // Merge, deduplicate, limit
  const allSections = [...specialSections]
  for (const gs of genreSections) {
    if (!allSections.find((s) => s.id === gs.id)) {
      allSections.push(gs)
    }
  }

  return { sections: allSections.slice(0, 4), isLoading }
}
