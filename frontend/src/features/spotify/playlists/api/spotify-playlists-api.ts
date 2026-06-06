// TODO: Review this file
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { SpotifyPlaylist, SpotifyPlaylistDetail, PlaylistSubscription } from "../types"

// ── Query keys ──

export const playlistKeys = {
  all: ["spotify-playlists"] as const,
  list: (params?: { limit?: number; offset?: number }) => ["spotify-playlists", "list", params] as const,
  detail: (id: string) => ["spotify-playlists", "detail", id] as const,
  subscriptions: () => ["spotify-playlists", "subscriptions"] as const,
}

// ── Queries ──

export function useSpotifyPlaylists(limit?: number, offset?: number) {
  return useQuery({
    queryKey: playlistKeys.list({ limit, offset }),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (limit) params.set("limit", String(limit))
      if (offset) params.set("offset", String(offset))
      const res = await apiClient.get(`/library/spotify/playlists?${params.toString()}`)
      return res.data as { items: SpotifyPlaylist[]; total?: number }
    },
  })
}

export function useSpotifyPlaylist(id: string) {
  return useQuery({
    queryKey: playlistKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/library/spotify/playlists/${id}`)
      return res.data as SpotifyPlaylistDetail
    },
    enabled: !!id,
  })
}

export function usePlaylistSubscriptions() {
  return useQuery({
    queryKey: playlistKeys.subscriptions(),
    queryFn: async () => {
      const res = await apiClient.get("/library/spotify/playlists/subscriptions")
      return res.data as PlaylistSubscription[]
    },
  })
}

// ── Mutations ──

export function useSubscribePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/subscribe`)
      return res.data as { subscription_id: string; task_id: string; message: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
    },
  })
}

export function useUnsubscribePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/unsubscribe`)
      return res.data as { message: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
    },
  })
}

export function useSyncPlaylist() {
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/sync`)
      return res.data as { task_id: string; message: string }
    },
  })
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ subscriptionId, autoSync }: { subscriptionId: string; autoSync: boolean }) => {
      const res = await apiClient.put(
        `/library/spotify/playlists/subscriptions/${subscriptionId}?auto_sync=${autoSync}`
      )
      return res.data as { message: string; auto_sync: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.subscriptions() })
    },
  })
}
