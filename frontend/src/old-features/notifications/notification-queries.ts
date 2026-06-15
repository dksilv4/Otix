// TODO: Review this file
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

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

export interface NotificationListResponse {
  items: Notification[]
  hasMore: boolean
  nextCursor: string | null
}

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
      staleTime: 3000,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async () => {
        const { data } = await apiClient.get<UnreadCount>('/notifications/unread-count')
        return data
      },
      staleTime: 3000,
    }),
}

export function useMarkRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.post(`/notifications/${notificationId}/read`)
    },
    onMutate: async (notificationId) => {
      // Optimistically mark as read in all list caches
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['notifications', 'list'] })
        .map((q) => q.queryKey)

      const snapshots = listKeys.map((key) => ({
        key,
        data: qc.getQueryData<NotificationListResponse>(key),
      }))

      for (const { key, data } of snapshots) {
        if (!data) continue
        qc.setQueryData<NotificationListResponse>(key, {
          ...data,
          items: data.items.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        })
      }

      // Decrement unread count
      const countKey = ['notifications', 'unread-count']
      const prevCount = qc.getQueryData<UnreadCount>(countKey)
      if (prevCount && prevCount.count > 0) {
        qc.setQueryData<UnreadCount>(countKey, { count: prevCount.count - 1 })
      }

      return { snapshots, prevCount }
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      for (const { key, data } of context.snapshots) {
        if (data) qc.setQueryData(key, data)
      }
      if (context.prevCount) {
        qc.setQueryData(['notifications', 'unread-count'], context.prevCount)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/read-all')
    },
    onMutate: () => {
      // Optimistically mark all as read
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['notifications', 'list'] })
        .map((q) => q.queryKey)

      const snapshots = listKeys.map((key) => ({
        key,
        data: qc.getQueryData<NotificationListResponse>(key),
      }))

      for (const { key, data } of snapshots) {
        if (!data) continue
        qc.setQueryData<NotificationListResponse>(key, {
          ...data,
          items: data.items.map((n) => ({ ...n, isRead: true })),
        })
      }

      const countKey = ['notifications', 'unread-count']
      const prevCount = qc.getQueryData<UnreadCount>(countKey)
      qc.setQueryData<UnreadCount>(countKey, { count: 0 })

      return { snapshots, prevCount }
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      for (const { key, data } of context.snapshots) {
        if (data) qc.setQueryData(key, data)
      }
      if (context.prevCount) {
        qc.setQueryData(['notifications', 'unread-count'], context.prevCount)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
