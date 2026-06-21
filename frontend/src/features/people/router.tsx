import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { PeopleDetailPage } from '@people/pages/people-detail-page'

export function createPeopleRoutes(rootRoute: AnyRoute) {
  const personDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/person/$personId',
    component: PeopleDetailPage,
    validateSearch: (search: Record<string, unknown>) => ({
      mediaType: (search.mediaType as string) || 'all',
      role: (search.role as string) || 'all',
    }),
  })

  return [personDetailRoute]
}
