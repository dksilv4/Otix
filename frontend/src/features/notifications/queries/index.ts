import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '@/features/notifications/types'

// apiClient handles 401 → token refresh and snake_case → camelCase conversion.

export const notificationQueries = {
  list: (cursor?: string, limit = 20) =>
    queryOptions({
      queryKey: ['notifications', 'list', { cursor, limit }],
      queryFn: async (): Promise<NotificationListResponse> => {
        const { data } = await apiClient.get('/notifications', {
          params: { limit, ...(cursor ? { cursor } : {}) },
        })
        return data
      },
      staleTime: 30_000,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async (): Promise<UnreadCount> => {
        const { data } = await apiClient.get('/notifications/unread-count')
        return data
      },
      staleTime: 30_000,
    }),
}
