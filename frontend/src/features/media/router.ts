import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'

const MediaDetailPage = lazy(() => import('./pages/media-detail-page').then(m => ({ default: m.MediaDetailPage })))

export function createMediaRoutes(rootRoute: AnyRoute) {
  const mediaDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId',
    component: MediaDetailPage,
    loader: ({ context, params }) => {
      void import('./pages/media-detail-page')
      void context.queryClient.prefetchQuery(
        mediaQueries.detail(params.mediaType, params.mediaId),
      )
    },
    // Optional ?season=N lets discover season rails deep-link a show straight
    // to its latest season. ?manage=true opens the media manager modal.
    validateSearch: (search: Record<string, unknown>) => {
      const result: { season?: number; manage?: boolean } = {}
      if (typeof search.season === 'string' && /^\d+$/.test(search.season)) {
        result.season = Number(search.season)
      }
      if (search.manage === true || search.manage === 'true') {
        result.manage = true
      }
      return result
    },
  })

  // Backwards-compatibility redirect: /manage URL redirects to the media detail page
  // with ?manage=true so the MediaManageModal opens seamlessly.
  const mediaManageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/media/$mediaType/$mediaId/manage',
    beforeLoad: ({ params }) => {
      throw redirect({
        to: '/media/$mediaType/$mediaId',
        params: { mediaType: params.mediaType, mediaId: params.mediaId },
        search: { manage: true },
      })
    },
  })

  return [mediaDetailRoute, mediaManageRoute]
}
