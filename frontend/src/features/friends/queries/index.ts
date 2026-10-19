import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import type {
  Friend,
  FriendRequest,
  FriendActivityEvent,
  FriendshipStatus,
} from '../types'

export const friendsQueries = {
  list: () =>
    queryOptions({
      queryKey: ['friends', 'list'],
      queryFn: async (): Promise<Friend[]> => {
        const { data } = await apiClient.get<Friend[]>('/friends')
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 30,
    }),

  incomingRequests: () =>
    queryOptions({
      queryKey: ['friends', 'requests', 'incoming'],
      queryFn: async (): Promise<FriendRequest[]> => {
        const { data } = await apiClient.get<FriendRequest[]>('/friends/requests/incoming')
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 20,
    }),

  outgoingRequests: () =>
    queryOptions({
      queryKey: ['friends', 'requests', 'outgoing'],
      queryFn: async (): Promise<FriendRequest[]> => {
        const { data } = await apiClient.get<FriendRequest[]>('/friends/requests/outgoing')
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 20,
    }),

  activity: (limit = 30) =>
    queryOptions({
      queryKey: ['friends', 'activity', limit],
      queryFn: async (): Promise<FriendActivityEvent[]> => {
        const { data } = await apiClient.get<FriendActivityEvent[]>('/users/me/friends/activity', {
          params: { limit },
        })
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 30,
    }),

  status: (userId: number) =>
    queryOptions({
      queryKey: ['friends', 'status', userId],
      queryFn: async (): Promise<FriendshipStatus> => {
        const { data } = await apiClient.get<FriendshipStatus>(`/friends/status/${userId}`)
        return data ?? { status: 'none', requestId: null }
      },
      enabled: Boolean(userId),
      staleTime: 1000 * 30,
    }),

  searchUsers: (query: string) =>
    queryOptions({
      queryKey: ['users', 'search', query],
      queryFn: async () => {
        const { data } = await apiClient.get<any>('/users/search', {
          params: { q: query, limit: 10 },
        })
        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.users)
            ? data.users
            : Array.isArray(data)
              ? data
              : []
        return items
      },
      enabled: query.trim().length > 0,
      staleTime: 1000 * 60 * 2,
    }),
}

export const useSendFriendRequest = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await apiClient.post(`/friends/requests/${userId}`)
      return data
    },
    onSuccess: (_, userId) => {
      showToast({
        title: 'Friend request sent',
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['friends', 'requests'] })
      void queryClient.invalidateQueries({ queryKey: ['friends', 'status', userId] })
    },
    onError: (err) => {
      showErrorToast(err, 'Failed to send friend request')
    },
  })
}

export const useAcceptFriendRequest = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: number) => {
      const { data } = await apiClient.post(`/friends/requests/${requestId}/accept`)
      return data
    },
    onSuccess: () => {
      showToast({
        title: 'Friend request accepted',
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
    onError: (err) => {
      showErrorToast(err, 'Failed to accept friend request')
    },
  })
}

export const useRejectFriendRequest = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: number) => {
      const { data } = await apiClient.post(`/friends/requests/${requestId}/reject`)
      return data
    },
    onSuccess: () => {
      showToast({
        title: 'Friend request declined',
        variant: 'default',
      })
      void queryClient.invalidateQueries({ queryKey: ['friends', 'requests'] })
    },
    onError: (err) => {
      showErrorToast(err, 'Failed to decline friend request')
    },
  })
}

export const useRemoveFriend = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await apiClient.delete(`/friends/${userId}`)
      return data
    },
    onSuccess: (_, userId) => {
      showToast({
        title: 'Friend removed',
        variant: 'default',
      })
      void queryClient.invalidateQueries({ queryKey: ['friends'] })
      void queryClient.invalidateQueries({ queryKey: ['friends', 'status', userId] })
    },
    onError: (err) => {
      showErrorToast(err, 'Failed to remove friend')
    },
  })
}
