import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface Friend {
  id: string
  username: string
  avatarUrl: string | null
  friendsSince: string
}

export interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  sender?: {
    id: string
    username: string
    avatarUrl: string | null
  } | null
  receiver?: {
    id: string
    username: string
    avatarUrl: string | null
  } | null
}

export interface FriendshipStatus {
  status: 'friends' | 'pending_sent' | 'pending_received' | 'none'
  requestId: string | null
}

export const friendQueries = {
  friends: () =>
    queryOptions({
      queryKey: ['friends'],
      queryFn: async () => {
        const { data } = await apiClient.get<Friend[]>('/friends')
        return data
      },
      staleTime: 1000 * 60 * 2,
    }),

  incomingRequests: () =>
    queryOptions({
      queryKey: ['friends', 'incoming'],
      queryFn: async () => {
        const { data } = await apiClient.get<FriendRequest[]>('/friends/requests/incoming')
        return data
      },
      staleTime: 1000 * 30,
    }),

  outgoingRequests: () =>
    queryOptions({
      queryKey: ['friends', 'outgoing'],
      queryFn: async () => {
        const { data } = await apiClient.get<FriendRequest[]>('/friends/requests/outgoing')
        return data
      },
      staleTime: 1000 * 30,
    }),

  status: (userId: string) =>
    queryOptions({
      queryKey: ['friends', 'status', userId],
      queryFn: async () => {
        const { data } = await apiClient.get<FriendshipStatus>(`/friends/status/${userId}`)
        return data
      },
      staleTime: 1000 * 30,
    }),
}
