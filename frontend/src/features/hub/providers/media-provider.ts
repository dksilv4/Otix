import { apiClient } from '@/lib/api/client'
import { router } from '@/lib/router'
import { MEDIA_TYPE_ICON, MEDIA_TYPE_LABEL, type MediaType } from '@/constants/media'
import type { StructuredSearchResponse } from '@/features/media/queries/media-queries'
import type { Command, CommandProvider } from '../types'

// Mirrors mediaQueries.structuredSearch in features/media — same endpoint and
// params, but called directly here because providers are plain async functions
// (no React Query), keeping the palette dependency-free and testable.
const GROUPED_SEARCH_ENDPOINT = '/search/grouped'

type MediaKey = 'movies' | 'shows' | 'games' | 'music'

const MEDIA_KEYS: MediaKey[] = ['movies', 'shows', 'games', 'music']

function mediaTypeFor(key: MediaKey): MediaType {
  switch (key) {
    case 'movies':
      return 'movie'
    case 'shows':
      return 'show'
    case 'games':
      return 'game'
    case 'music':
      return 'music'
  }
}

export function createMediaProvider(): CommandProvider {
  return {
    id: 'media',
    label: 'Media',
    domain: 'media',
    search: async (query: string): Promise<Command[]> => {
      const q = query.trim()
      if (!q) return []

      const { data } = await apiClient.get<StructuredSearchResponse>(GROUPED_SEARCH_ENDPOINT, {
        params: { q, media_type_limit: 5, best_results_limit: 5 },
      })

      const commands: Command[] = []
      for (const key of MEDIA_KEYS) {
        const mediaType = mediaTypeFor(key)
        for (const item of data[key] ?? []) {
          commands.push({
            id: `media:${mediaType}:${item.id}`,
            title: item.title,
            subtitle: item.releaseDate
              ? `${MEDIA_TYPE_LABEL[mediaType]} · ${item.releaseDate.slice(0, 4)}`
              : MEDIA_TYPE_LABEL[mediaType],
            icon: MEDIA_TYPE_ICON[mediaType],
            domain: 'media',
            run: () =>
              router.navigate({
                to: '/media/$mediaType/$mediaId',
                params: { mediaType, mediaId: item.id },
              }),
          })
        }
      }

      return commands.slice(0, 10)
    },
  }
}
