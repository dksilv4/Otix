import { apiClient } from '@/lib/api/client'
import type {
  CreateGameServerPayload,
  DedicatedGameServer,
  FriendUser,
  GameServerInvite,
  GameServerShare,
  GameServerQueryResult,
  UpdateGameServerPayload,
  VerifyServerPayload,
  VerifyServerResult,
} from '../types'

export const gameServersApi = {
  list: async (params?: { mediaId?: string; serverType?: string }): Promise<DedicatedGameServer[]> => {
    const { data } = await apiClient.get<DedicatedGameServer[]>('/game-servers/', { params })
    return data || []
  },

  byGame: async (mediaId: string): Promise<DedicatedGameServer[]> => {
    const { data } = await apiClient.get<DedicatedGameServer[]>(`/game-servers/by-game/${mediaId}/`)
    return data || []
  },

  get: async (serverId: number): Promise<DedicatedGameServer> => {
    const { data } = await apiClient.get<DedicatedGameServer>(`/game-servers/${serverId}/`)
    return data
  },

  create: async (payload: CreateGameServerPayload): Promise<DedicatedGameServer> => {
    const { data } = await apiClient.post<DedicatedGameServer>('/game-servers/', payload)
    return data
  },

  update: async (serverId: number, payload: UpdateGameServerPayload): Promise<DedicatedGameServer> => {
    const { data } = await apiClient.patch<DedicatedGameServer>(`/game-servers/${serverId}/`, payload)
    return data
  },

  delete: async (serverId: number): Promise<void> => {
    await apiClient.delete(`/game-servers/${serverId}/`)
  },

  verify: async (payload: VerifyServerPayload): Promise<VerifyServerResult> => {
    const { data } = await apiClient.post<VerifyServerResult>('/game-servers/verify/', payload)
    return data
  },

  query: async (
    serverId: number,
    clientResult?: Partial<GameServerQueryResult> | null
  ): Promise<{ queryResult: Record<string, unknown> | null; server: DedicatedGameServer }> => {
    const { data } = await apiClient.post<{ queryResult: Record<string, unknown> | null; server: DedicatedGameServer }>(
      `/game-servers/${serverId}/query/`,
      clientResult ? { clientResult } : undefined
    )
    return data
  },

  listShares: async (serverId: number): Promise<GameServerShare[]> => {
    const { data } = await apiClient.get<GameServerShare[]>(`/game-servers/${serverId}/shares/`)
    return data || []
  },

  share: async (
    serverId: number,
    payload: { userId: number; permission?: string }
  ): Promise<GameServerShare> => {
    const { data } = await apiClient.post<GameServerShare>(`/game-servers/${serverId}/shares/`, payload)
    return data
  },

  removeShare: async (serverId: number, userId: number): Promise<void> => {
    await apiClient.delete(`/game-servers/${serverId}/shares/${userId}/`)
  },

  createInvite: async (serverId: number): Promise<GameServerInvite> => {
    const { data } = await apiClient.post<GameServerInvite>(`/game-servers/${serverId}/invites/`)
    return data
  },

  disableInvite: async (serverId: number): Promise<void> => {
    await apiClient.delete(`/game-servers/${serverId}/invites/`)
  },

  resolveInvite: async (code: string): Promise<{ invite: GameServerInvite; server: DedicatedGameServer }> => {
    const { data } = await apiClient.get<{ invite: GameServerInvite; server: DedicatedGameServer }>(
      `/game-servers/invites/${code}/`
    )
    return data
  },

  joinInvite: async (code: string): Promise<DedicatedGameServer> => {
    const { data } = await apiClient.post<DedicatedGameServer>(`/game-servers/invites/${code}/join/`)
    return data
  },

  listFriends: async (): Promise<FriendUser[]> => {
    const { data } = await apiClient.get<FriendUser[]>('/friends')
    return data || []
  },
}
