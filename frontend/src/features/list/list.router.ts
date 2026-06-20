import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const ListDetailPage = lazy(() => import('./pages/list-detail-page').then(m => ({ default: m.ListDetailPage })))

export function createListRoutes(rootRoute: AnyRoute) {
  const listDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/$listId',
    component: ListDetailPage,
  })

  return [listDetailRoute]
}
