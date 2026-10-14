import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { companyQueries } from './queries/company-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const CompanyDetailPage = safeLazy(() =>
  import('./pages/company-detail-page').then(m => ({ default: m.CompanyDetailPage })),
)

export function createCompanyRoutes(rootRoute: AnyRoute) {
  const companyDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/company/$companyId',
    component: CompanyDetailPage,
    loader: ({ context, params }) => {
      safePrefetchChunk(() => import('./pages/company-detail-page'))
      void context.queryClient.prefetchQuery(companyQueries.detail(params.companyId))
      void context.queryClient.prefetchInfiniteQuery(companyQueries.titles(params.companyId, 24))
    },
  })

  return [companyDetailRoute]
}
