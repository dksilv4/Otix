import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const NotificationsPage = lazy(() =>
  import('./pages/notifications-page').then((m) => ({ default: m.NotificationsPage })),
)

export function createNotificationRoutes(rootRoute: AnyRoute) {
  const notificationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notifications',
    component: NotificationsPage,
  })
  return [notificationsRoute]
}
