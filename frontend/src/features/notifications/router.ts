import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { notificationQueries } from './queries'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const NotificationsPage = safeLazy(() =>
  import('./pages/notifications-page').then((m) => ({ default: m.NotificationsPage })),
)

export function createNotificationRoutes(rootRoute: AnyRoute) {
  const notificationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notifications',
    component: NotificationsPage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('./pages/notifications-page'))
      if (!localStorage.getItem(ACCESS_TOKEN_KEY)) return
      void context.queryClient.prefetchInfiniteQuery(notificationQueries.infiniteList())
      void context.queryClient.prefetchQuery(notificationQueries.unreadCount())
    },
  })
  return [notificationsRoute]
}
