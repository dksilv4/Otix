import {
  queryOptions,
  infiniteQueryOptions,
  useQueryClient,
  useMutation,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { CompanyDetail } from '@company/types'
import type { MediaItemSummary } from '@media/queries/media-queries'

// ── Query key factory ─────────────────────────────

export const companyKeys = {
  all: ['company'] as const,
  detail: (id: string) => ['company', id] as const,
  titles: (id: string, limit: number) => ['company', id, 'titles', limit] as const,
}

interface PaginatedTitles {
  count: number
  next: string | null
  results: MediaItemSummary[]
}

// ── Query options ─────────────────────────────────

export const companyQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: companyKeys.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<CompanyDetail>(`/company/${id}`)
        return data
      },
      enabled: !!id,
      staleTime: 1000 * 60 * 10,
    }),

  // Catalog browse is DRF-paginated ({count, next, results}) at ``/media/``.
  titles: (id: string, limit = 24) =>
    infiniteQueryOptions({
      queryKey: companyKeys.titles(id, limit),
      queryFn: async ({ pageParam }) => {
        const { data } = await apiClient.get<PaginatedTitles>('/media/', {
          params: { company: id, page: pageParam, page_size: limit },
        })
        return data
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage, allPages) =>
        lastPage.next ? allPages.length + 1 : undefined,
      enabled: !!id,
      staleTime: 1000 * 60 * 5,
    }),
}

// ── Mutations ─────────────────────────────────────
//
// Follow/unfollow and rating all return 204 with no body, so the cache is
// updated optimistically and revalidated on settle.

export function useFollowCompany(companyId: string) {
  const queryClient = useQueryClient()
  const key = companyKeys.detail(companyId)

  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/company/${companyId}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<CompanyDetail>(key)
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(key, {
          ...prev,
          isFollowed: true,
          followerCount: prev.followerCount + 1,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(key, context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUnfollowCompany(companyId: string) {
  const queryClient = useQueryClient()
  const key = companyKeys.detail(companyId)

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${companyId}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<CompanyDetail>(key)
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(key, {
          ...prev,
          isFollowed: false,
          followerCount: Math.max(0, prev.followerCount - 1),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(key, context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRateCompany(companyId: string) {
  const queryClient = useQueryClient()
  const key = companyKeys.detail(companyId)

  return useMutation({
    mutationFn: async (score: number) => {
      await apiClient.put(`/company/${companyId}/rating`, { score })
    },
    onMutate: async (score) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<CompanyDetail>(key)
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(key, { ...prev, userRating: score })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(key, context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUnrateCompany(companyId: string) {
  const queryClient = useQueryClient()
  const key = companyKeys.detail(companyId)

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${companyId}/rating`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<CompanyDetail>(key)
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(key, { ...prev, userRating: null })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(key, context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
