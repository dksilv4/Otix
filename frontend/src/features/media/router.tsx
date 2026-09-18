import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'

const MediaDetailPage = lazy(() => import('@media/pages/media-detail-page').then(m => ({ default: m.MediaDetailPage })))
const MediaManagePage = lazy(() => import('@media/pages/media-manage-page').then(m => ({ default: m.MediaManagePage })))

export function createMediaRoutes(rootRoute: AnyRoute) {
  const mediaDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId',
    component: MediaDetailPage,
    loader: ({ context, params }) => {
      void import('@media/pages/media-detail-page')
      void context.queryClient.prefetchQuery(
        mediaQueries.detail(params.mediaType, params.mediaId),
      )
    },
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

  // Admin-only full-page artwork chooser + metadata editor (replaces the old
  // per-media Edit modal). The page gates itself to admins.
  const mediaManageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId/manage',
    component: MediaManagePage,
    loader: ({ context, params }) => {
      void import('@media/pages/media-manage-page')
      void context.queryClient.prefetchQuery(
        mediaQueries.detail(params.mediaType, params.mediaId),
      )
    },
  })

  return [mediaDetailRoute, mediaManageRoute]
}
