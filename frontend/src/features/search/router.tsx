import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const SearchPage = lazy(() => import('@search/pages/search-page').then(m => ({ default: m.SearchPage })))

export function createSearchRoutes(rootRoute: AnyRoute) {
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    component: SearchPage,
    validateSearch: (search: Record<string, unknown>) => {
      const result: Record<string, string> = {}
      if (search.q) result.q = search.q as string
      if (search.type && search.type !== 'all') result.type = search.type as string
      if (search.sort) result.sort = search.sort as string
      return result
    },
  })

  return [searchRoute]
}
