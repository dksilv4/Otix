import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'
import type { GenreSearchParams } from './types'

const GenrePage = lazy(() =>
  import('./pages/genre-page').then((m) => ({ default: m.GenrePage })),
)

const GenresDirectoryPage = lazy(() =>
  import('./pages/genres-directory-page').then((m) => ({
    default: m.GenresDirectoryPage,
  })),
)

export function createGenreRoutes(rootRoute: AnyRoute) {
  // All Genres / Categories Directory Grid Page
  const genresRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/genres',
    component: GenresDirectoryPage,
    loader: () => {
      void import('./pages/genres-directory-page')
    },
  })

  // Specific Genre Media Grid Page
  const genreRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/genre/$genreId',
    component: GenrePage,
    validateSearch: (search: Record<string, unknown>): GenreSearchParams => {
      const result: GenreSearchParams = {}
      if (search?.type) result.type = search.type as GenreSearchParams['type']
      if (search?.sort) result.sort = search.sort as string
      if (search?.dir) result.dir = search.dir as 'asc' | 'desc'
      if (search?.certification) result.certification = search.certification as string
      if (search?.language) result.language = search.language as string
      if (typeof search?.isAnime === 'boolean') result.isAnime = search.isAnime
      return result
    },
    loader: ({ context, params, location }) => {
      void import('./pages/genre-page')
      const search = location.search as GenreSearchParams
      const mediaType = search?.type || 'movie'
      const genreId = params.genreId || 'action'
      void context.queryClient.prefetchInfiniteQuery(
        mediaQueries.infiniteList({
          type: mediaType,
          genre: genreId,
          sortBy: search?.sort || 'popularity',
          sortDir: search?.dir || 'desc',
          certification: search?.certification,
          limit: 48,
        }),
      )
    },
  })

  // Index redirect for /genre -> /genres
  const genreIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/genre',
    beforeLoad: () => {
      throw redirect({
        to: '/genres',
      })
    },
  })

  // Compatibility routes for /browse/$type and /browse
  const browseTypeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/browse/$type',
    beforeLoad: ({ params, search }: { params: { type?: string }; search: Record<string, unknown> }) => {
      const targetGenre = search?.genre as string | undefined
      if (targetGenre) {
        throw redirect({
          to: '/genre/$genreId',
          params: { genreId: targetGenre },
          search: { type: params?.type as GenreSearchParams['type'] },
        })
      }
      throw redirect({
        to: '/genres',
      })
    },
  })

  const browseIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/browse',
    beforeLoad: () => {
      throw redirect({
        to: '/genres',
      })
    },
  })

  return [genresRoute, genreRoute, genreIndexRoute, browseTypeRoute, browseIndexRoute]
}
