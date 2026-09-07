import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const MediaDetailPage = lazy(() => import('@media/pages/media-detail-page').then(m => ({ default: m.MediaDetailPage })))

export function createMediaRoutes(rootRoute: AnyRoute) {
  const mediaDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId',
    component: MediaDetailPage,
    // Optional ?season=N lets discover season rails deep-link a show straight
    // to its latest season (the URL survives refresh/share).
    validateSearch: (search: Record<string, unknown>) => {
      const result: { season?: number } = {}
      if (typeof search.season === 'string' && /^\d+$/.test(search.season)) {
        result.season = Number(search.season)
      }
      return result
    },
  })

  return [mediaDetailRoute]
}
