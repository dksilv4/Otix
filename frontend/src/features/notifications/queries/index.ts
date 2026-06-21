import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '../types'

export const notificationQueries = {
  list: (cursor?: string, limit = 20) =>
    queryOptions({
      queryKey: ['notifications', 'list', { cursor, limit }],
      queryFn: async () => {
        const params: Record<string, string | number> = { limit }
        if (cursor) params.cursor = cursor
        const { data } = await apiClient.get<NotificationListResponse>('/notifications', { params })
        return data
      },
      staleTime: 30_000,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async () => {
        const { data } = await apiClient.get<UnreadCount>('/notifications/unread-count')
        return data
      },
      staleTime: 30_000,
    }),
}
