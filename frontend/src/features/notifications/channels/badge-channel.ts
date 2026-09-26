import type { Channel, NotificationEvent, UnreadCount } from '../types'
import type { QueryClient } from '@tanstack/react-query'

/**
 * Cache-only unread bump. Prefer the SSE handler in NotificationsProvider —
 * kept here for any caller that still registers this channel.
 * Never invalidates the notifications list (no page refetch).
 */
export function createBadgeChannel(queryClient: QueryClient): Channel {
  return {
    name: 'badge',
    canDeliver: (event: NotificationEvent) => !event.isRead,
    deliver: (_event: NotificationEvent) => {
      queryClient.setQueryData<UnreadCount>(
        ['notifications', 'unread-count'],
        (prev) => ({ count: (prev?.count ?? 0) + 1 }),
      )
    },
  }
}
