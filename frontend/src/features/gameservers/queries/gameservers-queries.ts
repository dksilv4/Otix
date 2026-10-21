import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gameServersApi } from '../api/gameservers-api'
import type { CreateGameServerPayload, UpdateGameServerPayload } from '../types'

export const gameServersKeys = {
  all: ['game-servers'] as const,
  lists: () => [...gameServersKeys.all, 'list'] as const,
  list: (params?: { mediaId?: string; serverType?: string }) =>
    [...gameServersKeys.lists(), params] as const,
  byGame: (mediaId: string) => [...gameServersKeys.all, 'by-game', mediaId] as const,
  details: () => [...gameServersKeys.all, 'detail'] as const,
  detail: (id: number) => [...gameServersKeys.details(), id] as const,
  shares: (id: number) => [...gameServersKeys.detail(id), 'shares'] as const,
  friends: ['friends', 'list'] as const,
  invite: (code: string) => [...gameServersKeys.all, 'invite', code] as const,
}

export function useGameServers(params?: { mediaId?: string; serverType?: string }) {
  return useQuery({
    queryKey: gameServersKeys.list(params),
    queryFn: () => gameServersApi.list(params),
  })
}

export function useGameServersByGame(mediaId: string | undefined | null) {
  return useQuery({
    queryKey: gameServersKeys.byGame(mediaId || ''),
    queryFn: () => gameServersApi.byGame(mediaId!),
    enabled: Boolean(mediaId),
  })
}

export function useGameServer(serverId: number | undefined | null) {
  return useQuery({
    queryKey: gameServersKeys.detail(serverId || 0),
    queryFn: () => gameServersApi.get(serverId!),
    enabled: Boolean(serverId),
  })
}

export function useCreateGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateGameServerPayload) => gameServersApi.create(payload),
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
      if (server.mediaItemId) {
        void queryClient.invalidateQueries({ queryKey: gameServersKeys.byGame(server.mediaItemId) })
      }
    },
  })
}

export function useUpdateGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateGameServerPayload }) =>
      gameServersApi.update(id, payload),
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.detail(server.id) })
      if (server.mediaItemId) {
        void queryClient.invalidateQueries({ queryKey: gameServersKeys.byGame(server.mediaItemId) })
      }
    },
  })
}

export function useDeleteGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => gameServersApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
    },
  })
}

export function useQueryGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => gameServersApi.query(id),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.detail(data.server.id) })
      if (data.server.mediaItemId) {
        void queryClient.invalidateQueries({ queryKey: gameServersKeys.byGame(data.server.mediaItemId) })
      }
    },
  })
}

export function useGameServerShares(serverId: number | undefined | null) {
  return useQuery({
    queryKey: gameServersKeys.shares(serverId || 0),
    queryFn: () => gameServersApi.listShares(serverId!),
    enabled: Boolean(serverId),
  })
}

export function useShareGameServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serverId, userId, permission }: { serverId: number; userId: number; permission?: string }) =>
      gameServersApi.share(serverId, { userId, permission }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.shares(vars.serverId) })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
    },
  })
}

export function useRemoveGameServerShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ serverId, userId }: { serverId: number; userId: number }) =>
      gameServersApi.removeShare(serverId, userId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.shares(vars.serverId) })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
    },
  })
}

export function useCreateGameServerInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (serverId: number) => gameServersApi.createInvite(serverId),
    onSuccess: (_data, serverId) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.detail(serverId) })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
    },
  })
}

export function useDisableGameServerInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (serverId: number) => gameServersApi.disableInvite(serverId),
    onSuccess: (_data, serverId) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.detail(serverId) })
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
    },
  })
}

export function useResolveGameServerInvite(code: string | undefined | null) {
  return useQuery({
    queryKey: gameServersKeys.invite(code || ''),
    queryFn: () => gameServersApi.resolveInvite(code!),
    enabled: Boolean(code),
    retry: 1,
  })
}

export function useJoinGameServerInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => gameServersApi.joinInvite(code),
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: gameServersKeys.all })
      if (server.mediaItemId) {
        void queryClient.invalidateQueries({ queryKey: gameServersKeys.byGame(server.mediaItemId) })
      }
    },
  })
}

export function useOtixFriends() {
  return useQuery({
    queryKey: gameServersKeys.friends,
    queryFn: () => gameServersApi.listFriends(),
  })
}
