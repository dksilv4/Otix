import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '../types'

export function useMarkAllRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/read-all')
    },
    onMutate: () => {
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['notifications', 'list'] })
        .map((q) => q.queryKey)

      const snapshots = listKeys.map((key) => ({
        key,
        data: qc.getQueryData<any>(key),
      }))

      for (const { key, data } of snapshots) {
        if (!data) continue
        if ('pages' in data && Array.isArray(data.pages)) {
          const inf = data as InfiniteData<NotificationListResponse>
          qc.setQueryData(key, {
            ...inf,
            pages: inf.pages.map((page) => ({
              ...page,
              items: (Array.isArray(page.items) ? page.items : []).map((n) => ({
                ...n,
                isRead: true,
              })),
            })),
          })
        } else if ('items' in data) {
          qc.setQueryData<NotificationListResponse>(key, {
            ...data,
            items: (Array.isArray(data.items) ? data.items : []).map((n: any) => ({ ...n, isRead: true })),
          })
        }
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
