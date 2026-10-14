import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { listDetailOptions } from './list-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const ListDetailPage = safeLazy(() => import('./pages/list-detail-page').then(m => ({ default: m.ListDetailPage })))

export function createListRoutes(rootRoute: AnyRoute) {
  const listDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/$listId',
    component: ListDetailPage,
    loader: ({ context, params }) => {
      safePrefetchChunk(() => import('./pages/list-detail-page'))
      void context.queryClient.prefetchQuery(listDetailOptions(params.listId))
    },
  })

  return [listDetailRoute]
}

