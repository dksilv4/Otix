import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface PersonCredit {
  id: string
  mediaItem: {
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    releaseDate: string | null
  }
  role: string
  characterName?: string
  sortOrder: number
}

export interface PersonDetail {
  id: string
  name: string
  photoUrl: string | null
  bio: string | null
  birthDate: string | null
  deathDate: string | null
  birthplace: string | null
  knownFor: string | null
  credits: PersonCredit[]
}

export interface PersonSummary {
  id: string
  name: string
  photoUrl: string | null
  birthday: string | null
  placeOfBirth: string | null
}

export interface PersonListResponse {
  items: PersonSummary[]
  nextCursor: string | null
  hasMore: boolean
}

export interface RelatedArtist {
  id: string | null
  spotify_artist_id?: string
  name: string
  image_url: string | null
}

export const personQueries = {
  search: (query: string, limit = 8) =>
    queryOptions({
      queryKey: ['person', 'search', query, limit],
      queryFn: async () => {
        const { data } = await apiClient.get<PersonListResponse>('/person/search', {
          params: { q: query, limit },
        })
        return data
      },
      enabled: query.length > 0,
      staleTime: 1000 * 60 * 5,
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: ['person', id],
      queryFn: async () => {
        const { data } = await apiClient.get<PersonDetail>(`/person/${id}`)
        return data
      },
      staleTime: 1000 * 60 * 10,
    }),

  related: (id: string) =>
    queryOptions({
      queryKey: ['person', id, 'related'],
      queryFn: async () => {
        const { data } = await apiClient.get<{ artists: RelatedArtist[] }>(`/person/${id}/related`)
        return data.artists
      },
      staleTime: 1000 * 60 * 30,
    }),
}
