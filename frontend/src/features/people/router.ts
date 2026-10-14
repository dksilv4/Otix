import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { peopleQueries } from '@people/queries/people-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const PeopleDetailPage = safeLazy(() =>
  import('@people/pages/people-detail-page').then(m => ({ default: m.PeopleDetailPage })),
)

export function createPeopleRoutes(rootRoute: AnyRoute) {
  const personDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/person/$personId',
    component: PeopleDetailPage,
    loader: ({ context, params }) => {
      safePrefetchChunk(() => import('@people/pages/people-detail-page'))
      void context.queryClient.prefetchQuery(peopleQueries.detail(params.personId))
    },
    validateSearch: (search: Record<string, unknown>) => ({
      mediaType: (search.mediaType as string) || 'all',
      role: (search.role as string) || 'all',
    }),
  })

  return [personDetailRoute]
}
