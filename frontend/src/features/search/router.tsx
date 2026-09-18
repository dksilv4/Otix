import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { mediaQueries } from '@media/queries/media-queries'
import { peopleQueries } from '@people/queries/people-queries'
import { userQueries } from '@/features/user/user-queries'

const SearchPage = lazy(() => import('@search/pages/search-page').then(m => ({ default: m.SearchPage })))

interface SearchParams {
  q?: string
  type?: string
  sort?: string
}

export function createSearchRoutes(rootRoute: AnyRoute) {
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    component: SearchPage,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
      const result: SearchParams = {}
      if (search?.q) result.q = search.q as string
      if (search?.type && search.type !== 'all') result.type = search.type as string
      if (search?.sort) result.sort = search.sort as string
      return result
    },
    loaderDeps: ({ search }: { search: SearchParams }) => ({
      q: search?.q,
      type: search?.type,
      sort: search?.sort,
    }),
    loader: ({ context, deps }: { context: { queryClient: QueryClient }; deps: SearchParams }) => {
      void import('@search/pages/search-page')
      if (!deps?.q) return
      if (!deps.type) {
        void context.queryClient.prefetchQuery(mediaQueries.structuredSearch(deps.q))
        return
      }
      if (deps.type === 'person') {
        void context.queryClient.prefetchQuery(peopleQueries.search(deps.q, 40))
        return
      }
      if (deps.type === 'user') {
        void context.queryClient.prefetchQuery(userQueries.search(deps.q, 20))
        return
      }
      void context.queryClient.prefetchInfiniteQuery(
        mediaQueries.search({
          query: deps.q,
          type: deps.type,
          sortBy: deps.sort || undefined,
        }),
      )
    },
  })

  return [searchRoute]
}
