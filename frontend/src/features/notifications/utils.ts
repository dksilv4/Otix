import type { AxiosError } from 'axios'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type {
  Notification,
  NotificationEvent,
  NotificationListResponse,
  NotificationPreferences,
  UnreadCount,
} from './types'

export const actionErrorMessage = (error: unknown, fallback: string): string => {
  const detail = (error as AxiosError<{ detail?: string }>)?.response?.data?.detail
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback
}

export const isInQuietHours = (prefs: NotificationPreferences): boolean => {
  const start = prefs._quiet_start as string | undefined
  const end = prefs._quiet_end as string | undefined
  if (!start || !end) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (startMin <= endMin) return current >= startMin && current < endMin
  return current >= startMin || current < endMin
}

export const toFeedItem = (event: NotificationEvent): Notification => {
  return {
    id: String(event.id),
    type: event.type,
    title: event.title,
    body: event.body,
    metadataJson: event.metadata ?? {},
    isRead: event.isRead,
    createdAt: event.createdAt,
  }
}

export type FeedUpdate = 'inserted' | 'duplicate' | 'no-cache'

/**
 * Insert a live notification at the top of any cached feed.
 * Never invalidates/refetches — the page stays put and just gains a row.
 */
export const appendNotificationToFeed = (
  queryClient: QueryClient,
  event: NotificationEvent,
): FeedUpdate => {
  const item = toFeedItem(event)
  let outcome: FeedUpdate = 'no-cache'

  queryClient.setQueriesData<InfiniteData<NotificationListResponse>>(
    { queryKey: ['notifications', 'list'] },
    (old) => {
      if (!old?.pages?.length) return old
      const exists = old.pages.some((page) =>
        page.items.some((n) => String(n.id) === item.id),
      )
      if (exists) {
        outcome = 'duplicate'
        return old
      }
      outcome = 'inserted'
      const [first, ...rest] = old.pages
      return {
        ...old,
        pages: [{ ...first, items: [item, ...first.items] }, ...rest],
      }
    },
  )

  return outcome
}

export const bumpUnreadCount = (queryClient: QueryClient): void => {
  queryClient.setQueryData<UnreadCount>(
    ['notifications', 'unread-count'],
    (prev) => ({ count: (prev?.count ?? 0) + 1 }),
  )
}
