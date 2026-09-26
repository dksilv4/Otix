import { useAuth, useHasSession } from '@/lib/providers/auth'
import { useNotifications } from '../../hooks/use-notifications'
import { useMarkRead } from '../../hooks/use-mark-read'
import { NotificationCard } from '../molecules/notification-card'
import { NotificationSkeleton } from './notification-skeleton'
import { NotificationEmpty } from './notification-empty'
import { NotificationGuest } from './notification-guest'
import type { ActionCallbacks } from '../../types'
import { apiClient } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { showErrorToast, showToast } from '@ui/molecules/toast'
import type { AxiosError } from 'axios'

function actionErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as AxiosError<{ detail?: string }>)?.response?.data?.detail
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback
}

export function NotificationList() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const hasSession = useHasSession()
  const markRead = useMarkRead()
  const { allItems, isLoading, isError, refetch, isFetchingNextPage, lastItemRef } = useNotifications()
  const queryClient = useQueryClient()

  const actionCallbacks: ActionCallbacks = {
    acceptFriendRequest: async (requestId) => {
      try {
        await apiClient.post(`/friends/requests/${requestId}/accept`)
        showToast({ title: 'Friend request accepted', variant: 'success' })
        await queryClient.invalidateQueries({ queryKey: ['notifications'] })
        await queryClient.invalidateQueries({ queryKey: ['friends'] })
      } catch (error) {
        showErrorToast(actionErrorMessage(error, 'Could not accept friend request'))
        throw error
      }
    },
    rejectFriendRequest: async (requestId) => {
      try {
        await apiClient.post(`/friends/requests/${requestId}/reject`)
        showToast({ title: 'Friend request declined', variant: 'success' })
        await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      } catch (error) {
        showErrorToast(actionErrorMessage(error, 'Could not decline friend request'))
        throw error
      }
    },
    acceptListInvitation: async (listId) => {
      try {
        await apiClient.post(`/list/${listId}/collaborators/accept`)
        showToast({ title: 'Invitation accepted', variant: 'success' })
        await queryClient.invalidateQueries({ queryKey: ['notifications'] })
        await queryClient.invalidateQueries({ queryKey: ['list'] })
      } catch (error) {
        showErrorToast(actionErrorMessage(error, 'Could not accept invitation'))
        throw error
      }
    },
    declineListInvitation: async (listId) => {
      try {
        await apiClient.post(`/list/${listId}/collaborators/decline`)
        showToast({ title: 'Invitation declined', variant: 'success' })
        await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      } catch (error) {
        showErrorToast(actionErrorMessage(error, 'Could not decline invitation'))
        throw error
      }
    },
  }

  if (authLoading || (hasSession && isLoading)) return <NotificationSkeleton />
  if (!isAuthenticated) return <NotificationGuest />

  const notifications = Array.isArray(allItems) ? allItems.filter((n) => n && n.id) : []
  if (isError && notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-white/50">Failed to load notifications.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }
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
