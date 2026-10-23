import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { discoverQueries, type DiscoverListResponse } from './queries/discover-queries'
import { mediaQueries } from '@media/queries/media-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const DiscoverPage = safeLazy(() => import('@discover/pages/discover-page').then(m => ({ default: m.DiscoverPage })))
const DiscoverRailPage = safeLazy(() => import('@discover/pages/discover-rail-page').then(m => ({ default: m.DiscoverRailPage })))

function prefetchHeroSlideDetails(queryClient?: QueryClient) {
  if (!queryClient) return
  void queryClient.prefetchInfiniteQuery(discoverQueries.hero()).then(() => {
    const data = queryClient.getQueryData<InfiniteData<DiscoverListResponse>>(
      discoverQueries.hero().queryKey,
    )
    const items = data?.pages?.[0]?.items ?? []
    for (const item of items.slice(0, 2)) {
      if (item?.id && item?.mediaType) {
        void queryClient.prefetchQuery(mediaQueries.detail(item.mediaType, item.id))
      }
    }
  })
}

export function createDiscoverRoutes(rootRoute: AnyRoute) {
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: DiscoverPage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('@discover/pages/discover-page'))
      if (!context?.queryClient) return
      prefetchHeroSlideDetails(context.queryClient)
      void context.queryClient.prefetchInfiniteQuery(discoverQueries.list('movie', 'trending'))
      void context.queryClient.prefetchInfiniteQuery(discoverQueries.list('show', 'trending'))
      void context.queryClient.prefetchInfiniteQuery(discoverQueries.trendingSeasons())
    },
  })

  const railRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/discover/$mediaType/$listType',
    component: DiscoverRailPage,
    loader: ({ params, context }) => {
      safePrefetchChunk(() => import('@discover/pages/discover-rail-page'))
      if (!context?.queryClient) return
      if (params.mediaType === 'season' && params.listType === 'trending') {
        void context.queryClient.prefetchInfiniteQuery(discoverQueries.trendingSeasons())
      } else {
        void context.queryClient.prefetchInfiniteQuery(
          discoverQueries.list(params.mediaType, params.listType),
        )
      }
    },
  })

  return [homeRoute, railRoute]
}
