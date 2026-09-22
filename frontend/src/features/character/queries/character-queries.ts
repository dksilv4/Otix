import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { CharacterDetail, CharacterSummary } from '../types'

export const characterKeys = {
  all: ['character'] as const,
  detail: (id: string) => ['character', id] as const,
  list: (search?: string) => ['character', 'list', search ?? ''] as const,
}

export const characterQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: characterKeys.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<CharacterDetail>(`/character/${id}`)
        return data
      },
      enabled: !!id,
      staleTime: 1000 * 60 * 10,
    }),

  list: (search?: string) =>
    queryOptions({
      queryKey: characterKeys.list(search),
      queryFn: async () => {
        const { data } = await apiClient.get<{ results?: CharacterSummary[] } | CharacterSummary[]>(
          '/character/',
          {
            params: search ? { search } : undefined,
          },
        )
        if (Array.isArray(data)) return data
        return data.results ?? []
      },
      staleTime: 1000 * 60 * 5,
    }),
}
