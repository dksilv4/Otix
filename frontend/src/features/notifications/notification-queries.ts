import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  metadataJson: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface UnreadCount {
  count: number
}

export const notificationQueries = {
  list: () =>
    queryOptions({
      queryKey: ['notifications'],
      queryFn: async () => {
        const { data } = await apiClient.get<Notification[]>('/notifications')
        return data
      },
      staleTime: 1000 * 30,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async () => {
        const { data } = await apiClient.get<UnreadCount>('/notifications/unread-count')
        return data
      },
      staleTime: 1000 * 15,
    }),
}
