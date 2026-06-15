import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const SearchPage = lazy(() => import('@search/pages/search-page').then(m => ({ default: m.SearchPage })))

export function createSearchRoutes(rootRoute: AnyRoute) {
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    component: SearchPage,
    validateSearch: (search: Record<string, unknown>) => ({
      q: (search.q as string) || '',
      type: (search.type as string) || 'all',
      sort: (search.sort as string) || '',
    }),
  })

  return [searchRoute]
}
