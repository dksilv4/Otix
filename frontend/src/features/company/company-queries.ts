// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface CompanyDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  originCountry: string | null
  followerCount: number
  isFollowed: boolean | null
  avgRating: number | null
  userRating: number | null
}

export const companyQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: ['company', id],
      queryFn: async () => {
        const { data } = await apiClient.get<CompanyDetail>(`/company/${id}`)
        return data
      },
      staleTime: 1000 * 60 * 10,
    }),
}

export function useFollowCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/company/${id}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          isFollowed: true,
          followerCount: prev.followerCount + 1,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
  })
}

export function useUnfollowCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${id}/follow`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          isFollowed: false,
          followerCount: Math.max(0, prev.followerCount - 1),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
  })
}

export function useRateCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (score: number) => {
      await apiClient.put(`/company/${id}/rating`, { score })
    },
    onMutate: async (score) => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          userRating: score,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] })
    },
  })
}

export function useUnrateCompany(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/company/${id}/rating`)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['company', id] })
      const prev = queryClient.getQueryData<CompanyDetail>(['company', id])
      if (prev) {
        queryClient.setQueryData<CompanyDetail>(['company', id], {
          ...prev,
          userRating: null,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['company', id], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] })
    },
  })
}
