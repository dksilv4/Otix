import { BellRing } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { DkAvatar } from '@/old-features/ui/atoms/avatar'
import { notificationQueries } from '@/features/notifications/queries'
import { useMarkRead } from '@/features/notifications/hooks/use-mark-read'
import { useMarkAllRead } from '@/features/notifications/hooks/use-mark-all-read'
 
import type { Notification } from '@/features/notifications/types'
import { ActivityModuleSection } from './activity-module-section'
import { formatTimeAgo } from '@/lib/utils'

/** Notifications panel section showing friend requests, list invitations, and unread alerts. */
export function ActivityModuleNotifications({ onClose }: { onClose: () => void }) {
  const { user: currentUser, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  })

  const { data: listData } = useQuery({
    ...notificationQueries.list(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  })

  const notifications: Notification[] = listData?.items ?? []
  const unreadCount = unreadData?.count ?? 0

  const handleNotifAction = async (notification: Notification, action: 'accept' | 'reject') => {
    const meta = notification.metadataJson as Record<string, unknown>
    const requestId = meta.requestId as string | undefined
    if (!requestId) return
    try {
      await apiClient.post(`/friends/requests/${requestId}/${action}`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      if (action === 'accept' && currentUser?.username) {
        queryClient.invalidateQueries({ queryKey: ['user', currentUser.username] })
      }
    } catch { /* ignore */ }
  }

  const handleListAction = async (notification: Notification, action: 'accept' | 'decline') => {
    const listId = notification.metadataJson?.listId as string | undefined
    if (!listId) return
    try {
      await apiClient.post(`/list/${listId}/collaborators/${action}`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['list'] })
    } catch { /* ignored */ }
  }

  if (!isAuthenticated || notifications.length === 0) return null

  return (
    <ActivityModuleSection className="flex flex-col gap-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-white/50" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-primary/70">({unreadCount})</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.slice(0, 10).map((n) => (
          <div
            key={n.id}
            className={"flex items-start gap-2.5 px-2 py-2 rounded-xl transition-colors" + (!n.isRead ? " bg-white/[0.03]" : "")}
          >
            <DkAvatar
              name={
                n.type === 'friend_request' ? '?' :
                n.type === 'friend_rejected' ? '✕' :
                n.type === 'friend_removed' ? '−' :
                n.type === 'list_invitation' ? '👥' : ''
              }
              size="sm"
              className="shrink-0 mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/80">{n.title}</p>
              {n.body && <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{n.body}</p>}
              <p className="text-[10px] mt-1 text-white/30">{formatTimeAgo(n.createdAt)}</p>

              {n.type === 'friend_request' && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleNotifAction(n, 'accept')}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNotifAction(n, 'reject')}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-white/10 text-white/60 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              )}

              {n.type === 'list_invitation' && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleListAction(n, 'accept')}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleListAction(n, 'decline')}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-white/10 text-white/60 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>

            {!n.isRead && (
              <button
                type="button"
                onClick={() => markRead.mutate(n.id)}
                className="shrink-0 mt-1 cursor-pointer"
              >
                <span className="block h-2 w-2 rounded-full bg-primary" />
              </button>
            )}
          </div>
        ))}

        <Link
          to="/notifications"
          onClick={onClose}
          className="block w-full py-2 text-center text-[11px] font-medium text-white/40 hover:text-white/80 transition-colors rounded-xl bg-white/[0.03] hover:bg-white/[0.06]"
        >
          View all
        </Link>
    </ActivityModuleSection>
  )
}
