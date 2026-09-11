import { useAuth } from '@/lib/providers/auth'
import { useNotifications } from '../../hooks/use-notifications'
import { useMarkRead } from '../../hooks/use-mark-read'
import { NotificationCard } from '../molecules/notification-card'
import { NotificationSkeleton } from './notification-skeleton'
import { NotificationEmpty } from './notification-empty'
import { NotificationGuest } from './notification-guest'
import type { ActionCallbacks } from '../../types'
import { apiClient } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'

export function NotificationList() {
  const { isAuthenticated } = useAuth()
  const markRead = useMarkRead()
  const { allItems, isLoading, isFetchingNextPage, lastItemRef } = useNotifications()
  const queryClient = useQueryClient()

  const actionCallbacks: ActionCallbacks = {
    acceptFriendRequest: async (requestId) => {
      await apiClient.post(`/friends/requests/${requestId}/accept`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
    rejectFriendRequest: async (requestId) => {
      await apiClient.post(`/friends/requests/${requestId}/reject`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    acceptListInvitation: async (listId) => {
      await apiClient.post(`/list/${listId}/collaborators/accept`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['list'] })
    },
    declineListInvitation: async (listId) => {
      await apiClient.post(`/list/${listId}/collaborators/decline`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  }

  if (!isAuthenticated) return <NotificationGuest />

  if (isLoading) return <NotificationSkeleton />

  const notifications = Array.isArray(allItems) ? allItems.filter((n) => n && n.id) : []
  if (notifications.length === 0) return <NotificationEmpty />

  return (
    <div id="notification-list" className="flex flex-col">
      {notifications.map((n, i) => (
        <div
          key={n.id}
          ref={i === notifications.length - 1 ? lastItemRef : undefined}
        >
          <NotificationCard
            notification={n}
            onMarkRead={markRead.mutate}
            actionCallbacks={actionCallbacks}
          />
        </div>
      ))}
      {isFetchingNextPage && <NotificationSkeleton count={3} />}
    </div>
  )
}
