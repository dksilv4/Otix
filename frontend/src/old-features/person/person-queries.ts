// TODO: Review this file
import { queryOptions, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface EpisodeInfo {
  episodeNumber: number
  name: string | null
  airDate: string | null
}

export interface SeasonInfo {
  seasonNumber: number
  name: string | null
  firstAirDate: string | null
  lastAirDate: string | null
  episodes: EpisodeInfo[]
}

export interface PersonCredit {
  id: string
  mediaItem: {
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    releaseDate: string | null
    seasons: SeasonInfo[] | null
  } | null
  role: string
  characterName?: string
  sortOrder: number
}

export interface PersonDetail {
  id: string
  name: string
  photoUrl: string | null
  biography: string | null
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  followerCount: number
  isFollowed: boolean | null
  avgRating: number | null
  userRating: number | null
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

export function useFollowPerson(personId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ followed: boolean; followerCount: number }>(
        `/person/${personId}/follow`
      )
      return data
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['person', personId] })
      const prev = queryClient.getQueryData<PersonDetail>(['person', personId])
      if (prev) {
        queryClient.setQueryData<PersonDetail>(['person', personId], {
          ...prev,
          isFollowed: true,
          followerCount: prev.followerCount + 1,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['person', personId], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
    },
  })
}

export function useUnfollowPerson(personId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete<{ followed: boolean; followerCount: number }>(
        `/person/${personId}/follow`
      )
      return data
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['person', personId] })
      const prev = queryClient.getQueryData<PersonDetail>(['person', personId])
      if (prev) {
        queryClient.setQueryData<PersonDetail>(['person', personId], {
          ...prev,
          isFollowed: false,
          followerCount: Math.max(0, prev.followerCount - 1),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['person', personId], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
    },
  })
}

export function useRatePerson(personId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (score: number) => {
      await apiClient.put(`/person/${personId}/rating`, { score })
    },
    onMutate: async (score) => {
      await queryClient.cancelQueries({ queryKey: ['person', personId] })
      const prev = queryClient.getQueryData<PersonDetail>(['person', personId])
      if (prev) {
        queryClient.setQueryData<PersonDetail>(['person', personId], {
          ...prev,
          userRating: score,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['person', personId], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
    },
  })
}

export function useUnratePerson(personId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/person/${personId}/rating`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['person', personId] })
      const prev = queryClient.getQueryData<PersonDetail>(['person', personId])
      if (prev) {
        queryClient.setQueryData<PersonDetail>(['person', personId], {
          ...prev,
          userRating: null,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['person', personId], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] })
    },
  })
}
