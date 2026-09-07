import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export const mediaAdminQueryKeys = {
  mirroring: ['media', 'admin', 'mirroring'] as const,
  storage: ['media', 'admin', 'storage'] as const,
}

export interface MirroringState {
  enabled: boolean
}

export interface PurgeResult {
  deleted: number
  bytesFreed: number
}

/** Server-wide local-artwork mirroring flag (GET /media/admin/mirroring). */
export function useMirroring(enabled = true) {
  return useQuery<MirroringState>({
    queryKey: mediaAdminQueryKeys.mirroring,
    queryFn: async () => {
      const { data } = await apiClient.get<MirroringState>('/media/admin/mirroring')
      return data
    },
    staleTime: 30_000,
    enabled,
  })
}

/** Flip the server-wide mirroring flag (PUT /media/admin/mirroring). */
export function useSetMirroring() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await apiClient.put<MirroringState>('/media/admin/mirroring', { enabled })
      return data
    },
    onSuccess: (state) => {
      queryClient.setQueryData(mediaAdminQueryKeys.mirroring, state)
    },
  })
}

/** Delete every locally mirrored artwork file (DELETE /media/admin/assets). */
export function usePurgeAssets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete<PurgeResult>('/media/admin/assets')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAdminQueryKeys.storage })
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
    },
  })
}
