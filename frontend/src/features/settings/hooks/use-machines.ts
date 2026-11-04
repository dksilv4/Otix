import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import type {
  DetectDrivesResponse,
  MachineInput,
  ServerMachineInput,
  UserHome,
  UserMachine,
  UserServerMachine,
} from '../types/server-machines'

export const machineQueryKeys = {
  all: ['machines'] as const,
  list: (homeId?: number | null) => ['machines', 'list', homeId ?? 'all'] as const,
  detail: (id: number) => ['machines', 'detail', id] as const,
  homes: ['homes'] as const,
}

export const serverMachineQueryKeys = machineQueryKeys

export const useUserHomes = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: machineQueryKeys.homes,
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
    mutationFn: async (payload: {
      name: string
      description?: string
      isDefault?: boolean
      subnetCidr?: string
      wifiSsid?: string
      gatewayMac?: string
      bssid?: string
      localServerUrl?: string
    }) => {
      const res = await apiClient.post<UserHome>('/library/homes', payload)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
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
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
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
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] })
    },
  })
}

export const useMachines = (homeId?: number | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: machineQueryKeys.list(homeId),
    queryFn: async (): Promise<UserMachine[]> => {
      const params = homeId != null ? { home_id: homeId } : undefined
      const res = await apiClient.get<UserMachine[]>('/machines', { params })
      const machines = res?.data ?? []
      if (typeof window !== 'undefined' && Array.isArray(machines)) {
        const desktopApi = getDesktopAPI() ?? (window as any).desktopAPI
        if (desktopApi?.syncMachineMappings) {
          void desktopApi.syncMachineMappings(
            machines.map((m) => ({
              name: m.name,
              host: m.host,
              smbHost: m.smbHost,
            })),
          )
        }
      }
      return machines
    },
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
  })
}

export const useServerMachines = useMachines

export const useCreateMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: MachineInput | ServerMachineInput) => {
      const res = await apiClient.post<UserMachine>('/machines', input)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] })
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
    },
  })
}

export const useCreateServerMachine = useCreateMachine

export const useUpdateMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<MachineInput> & { id: number }) => {
      const res = await apiClient.patch<UserMachine>(`/machines/${id}`, patch)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] })
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
    },
  })
}

export const useUpdateServerMachine = useUpdateMachine

export const useDeleteMachine = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/machines/${id}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] })
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
    },
  })
}

export const useDeleteServerMachine = useDeleteMachine

export const useDetectMachineDrives = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      machineId,
      serverId,
      nodeId,
    }: {
      machineId?: number
      serverId?: number
      nodeId?: number
    }): Promise<DetectDrivesResponse> => {
      const targetId = machineId ?? serverId
      const url = targetId ? `/machines/${targetId}/detect-drives` : `/machines/detect-drives`
      const res = await apiClient.post<DetectDrivesResponse>(url, { node_id: nodeId })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] })
    },
  })
}

export const useDetectServerDrives = useDetectMachineDrives

export const useAssignNodeHome = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ nodeId, homeId }: { nodeId: number; homeId: number | null }) => {
      const res = await apiClient.patch(`/library/nodes/${nodeId}`, { home_id: homeId })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nodes'] })
      void queryClient.invalidateQueries({ queryKey: ['game-servers'] })
      void queryClient.invalidateQueries({ queryKey: machineQueryKeys.homes })
    },
  })
}
