import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const LibraryPage = lazy(() => import('@/features/library/pages/library-page').then(m => ({ default: m.LibraryPage })))
const ListDetailPage = lazy(() => import('./pages/list-detail-page').then(m => ({ default: m.ListDetailPage })))

export function createListRoutes(rootRoute: AnyRoute) {
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: LibraryPage,
  })

  const listDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/$listId',
    component: ListDetailPage,
  })

  return [libraryRoute, listDetailRoute]
}
