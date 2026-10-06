import { BellRing, CheckCheck, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, useHasSession } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import { notificationQueries } from '@/features/notifications/queries'
import { useNotifications } from '@/features/notifications/hooks/use-notifications'
import { useMarkRead } from '@/features/notifications/hooks/use-mark-read'
import { useMarkAllRead } from '@/features/notifications/hooks/use-mark-all-read'
import { getTypeConfig } from '@/features/notifications/registry'
import { NotificationIcon } from '@/features/notifications/components/atoms/notification-icon'
import { NotificationTime } from '@/features/notifications/components/atoms/notification-time'
import { NotificationActions } from '@/features/notifications/components/molecules/notification-actions'
import type { ActionCallbacks, Notification } from '@/features/notifications/types'
import { actionErrorMessage } from '@/features/notifications/utils'
import { ActivityModuleSection } from './activity-module-section'

export interface ActivityModuleNotificationsProps {
  onClose: () => void
}

/** Notifications panel section synchronized in real time with the notification page and SSE stream. */
export const ActivityModuleNotifications = ({ onClose }: ActivityModuleNotificationsProps) => {
  const { isAuthenticated } = useAuth()
  const hasSession = useHasSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  // Use the shared infinite query that receives live SSE events from NotificationsProvider
  const { allItems: notifications } = useNotifications()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: hasSession,
  })
  const unreadCount = unreadData?.count ?? 0

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
        await queryClient.invalidateQueries({ queryKey: ['list'] })
      } catch (error) {
        showErrorToast(actionErrorMessage(error, 'Could not decline invitation'))
        throw error
      }
    },
  }

  if (!isAuthenticated || notifications.length === 0) return null

  const handleCardClick = (notification: Notification, link: string | null | undefined) => {
    if (link) {
      onClose()
      navigate({ to: link })
    }
  }

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary tabular-nums">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer disabled:opacity-50"
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications feed preview (up to 8 items) */}
      <div className="flex flex-col gap-1.5">
        {notifications.slice(0, 8).map((n) => {
          const config = getTypeConfig(n.type)
          const link = config?.getLink?.(n)
          const actions = config?.getActions?.(n, actionCallbacks)

          return (
            <div
              key={n.id}
              role={link ? 'button' : undefined}
              tabIndex={link ? 0 : undefined}
              onClick={() => handleCardClick(n, link)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && link) handleCardClick(n, link)
              }}
              className={
                'group relative flex items-start gap-2.5 p-2.5 rounded-xl transition-all duration-150 ' +
                (!n.isRead
                  ? 'bg-white/[0.04]'
                  : 'bg-white/[0.015] hover:bg-white/[0.04]') +
                (link ? ' cursor-pointer' : '')
              }
            >
              <div className="shrink-0 mt-0.5">
                <NotificationIcon type={n.type} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1.5">
                  <p className="text-xs font-semibold text-white/90 leading-tight">
                    {n.title}
                  </p>
                  <NotificationTime createdAt={n.createdAt} />
                </div>

                {n.body && (
                  <p className="text-[11px] text-white/50 mt-0.5 line-clamp-2 leading-relaxed">
                    {n.body}
                  </p>
                )}

                {actions && actions.length > 0 && (
                  <div
                    className="mt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <NotificationActions actions={actions} />
                  </div>
                )}
              </div>

              {/* Unread indicator / mark read button */}
              {!n.isRead && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    markRead.mutate(n.id)
                  }}
                  className="shrink-0 mt-1 p-1 -mr-1 rounded-full text-white/20 hover:text-primary transition-colors cursor-pointer"
                  title="Mark as read"
                  aria-label="Mark as read"
                >
                  <span className="block h-2 w-2 rounded-full bg-primary" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Link
        to="/notifications"
        onClick={onClose}
        className="flex items-center justify-center gap-1.5 w-full py-2 text-center text-xs font-medium text-white/50 hover:text-white transition-colors rounded-xl bg-white/[0.03] hover:bg-white/[0.07]"
      >
        <span>View all notifications</span>
        <ExternalLink className="h-3 w-3 opacity-60" />
      </Link>
    </ActivityModuleSection>
  )
};
