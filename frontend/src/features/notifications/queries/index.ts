import { queryOptions } from '@tanstack/react-query'
import { cam } from '@/lib/api/camel-client'

// ponytail: cam.GET infers response type from the URL AND converts snake_case → camelCase.
// No manual type params needed. Properties like next_cursor become nextCursor automatically.

export const notificationQueries = {
  list: (cursor?: string, limit = 20) =>
    queryOptions({
      queryKey: ['notifications', 'list', { cursor, limit }],
      queryFn: async () => {
        const { data } = await cam.GET('/api/notifications', {
          params: { query: { limit: limit.toString(), ...(cursor ? { cursor } : {}) } },
        })
        return data
      },
      staleTime: 30_000,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async () => {
        const { data } = await cam.GET('/api/notifications/unread-count')
        return data
      },
      staleTime: 30_000,
    }),
}
