import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type {
  DetectDrivesResponse,
  ServerMachineInput,
  UserHome,
  UserServerMachine,
} from '../types/server-machines'

export const serverMachineQueryKeys = {
  all: ['server-machines'] as const,
  list: (homeId?: number | null) => ['server-machines', 'list', homeId ?? 'all'] as const,
  detail: (id: number) => ['server-machines', 'detail', id] as const,
  homes: ['homes'] as const,
}

export const useUserHomes = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: serverMachineQueryKeys.homes,
    queryFn: async (): Promise<UserHome[]> => {
      const res = await apiClient.get<UserHome[]>('/library/homes')
      return res?.data ?? []
    },
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  })
}

export const useCreateHome = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string; isDefault?: boolean; subnetCidr?: string }) => {
      const res = await apiClient.post<UserHome>('/library/homes', payload)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}

export const useUpdateHome = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<UserHome> & { id: number }) => {
      const res = await apiClient.patch<UserHome>(`/library/homes/${id}`, patch)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}

export const useDeleteHome = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/library/homes/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.all })
    },
  })
}

export const useServerMachines = (homeId?: number | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: serverMachineQueryKeys.list(homeId),
    queryFn: async (): Promise<UserServerMachine[]> => {
      const params = homeId != null ? { home_id: homeId } : undefined
      const res = await apiClient.get<UserServerMachine[]>('/library/server-machines', { params })
      return res?.data ?? []
    },
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
  })
}

export const useCreateServerMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ServerMachineInput) => {
      const res = await apiClient.post<UserServerMachine>('/library/server-machines', input)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}

export const useUpdateServerMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ServerMachineInput> & { id: number }) => {
      const res = await apiClient.patch<UserServerMachine>(`/library/server-machines/${id}`, patch)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}

export const useDeleteServerMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/library/server-machines/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}

export const useDetectServerDrives = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serverId, nodeId }: { serverId?: number; nodeId?: number }): Promise<DetectDrivesResponse> => {
      const url = serverId
        ? `/library/server-machines/${serverId}/detect-drives`
        : `/library/server-machines/detect-drives`
      const res = await apiClient.post<DetectDrivesResponse>(url, { node_id: nodeId })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.all })
    },
  })
}

export const useAssignNodeHome = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ nodeId, homeId }: { nodeId: number; homeId: number | null }) => {
      const res = await apiClient.patch(`/library/servers/${nodeId}`, { home_id: homeId })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['game-servers'] })
      void queryClient.invalidateQueries({ queryKey: serverMachineQueryKeys.homes })
    },
  })
}
