import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const MediaDetailPage = lazy(() => import('@media/pages/media-detail-page').then(m => ({ default: m.MediaDetailPage })))

export function createMediaRoutes(rootRoute: AnyRoute) {
  const mediaDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId',
    component: MediaDetailPage,
  })

  return [mediaDetailRoute]
}
