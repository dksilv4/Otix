import { queryOptions, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
<<<<<<<< HEAD:frontend/src/old-features/person/person-queries.ts
========
import type { PersonDetail, PersonSummary, PersonListResponse, RelatedArtist } from '@people/types'
>>>>>>>> d607927de356d7641bc4391ed7e97bc43aae7dc2:frontend/src/features/people/queries/people-queries.ts

// ── Query key factory ─────────────────────────────

export const peopleKeys = {
  all: ['person'] as const,
  search: (query: string, limit = 8) => ['person', 'search', query, limit] as const,
  detail: (id: string) => ['person', id] as const,
  related: (id: string) => ['person', id, 'related'] as const,
}

// ── Query options ─────────────────────────────────

export const peopleQueries = {
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

// ── Mutations ─────────────────────────────────────

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
