import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { arrKeys } from './use-server-arr'
import { usenetKeys } from './use-server-usenet'

export type InstanceKind = 'usenet' | 'radarr' | 'sonarr'

export interface ImportNodeInstancesResult {
  ok: boolean
  imported?: InstanceKind[]
  skipped?: InstanceKind[]
  errors?: Array<{ kind?: string; error?: string }>
  error?: string
  fromServerId?: number
  toServerId?: number
}

export interface ImportNodeInstancesPayload {
  fromServerId: number
  toServerId: number
  kinds?: InstanceKind[]
}

export function useImportNodeInstances() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fromServerId, toServerId, kinds }: ImportNodeInstancesPayload) => {
      const { data } = await apiClient.post<ImportNodeInstancesResult>(
        `/library/servers/${toServerId}/instances/import`,
        kinds ? { fromServerId, kinds } : { fromServerId },
      )
      return data
    },
    onSuccess: (_data, { toServerId }) => {
      void queryClient.invalidateQueries({ queryKey: usenetKeys.config(toServerId) })
      void queryClient.invalidateQueries({ queryKey: arrKeys.radarr.config(toServerId) })
      void queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.config(toServerId) })
    },
  })
}
