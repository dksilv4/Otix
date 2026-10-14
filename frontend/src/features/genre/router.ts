import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'
import type { GenreSearchParams } from './types'

const GenrePage = safeLazy(() =>
  import('./pages/genre-page').then((m) => ({ default: m.GenrePage })),
)

const GenresDirectoryPage = safeLazy(() =>
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
      safePrefetchChunk(() => import('./pages/genres-directory-page'))
    },
  })

  // Specific Genre Media Grid Page
  const genreRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/genre/$genreId',
    component: GenrePage,
    validateSearch: (search: Record<string, unknown>): GenreSearchParams => {
      const result: GenreSearchParams = {}
      if (search?.type === 'movie' || search?.type === 'show' || search?.type === 'game') {
        result.type = search.type
      }
      if (search?.sort) result.sort = search.sort as string
      if (search?.dir) result.dir = search.dir as 'asc' | 'desc'
      if (search?.certification) result.certification = search.certification as string
      if (typeof search?.genres === 'string' && search.genres.trim()) {
        result.genres = search.genres.trim().toLowerCase()
      }
      if (typeof search?.language === 'string' && search.language.trim()) {
        result.language = search.language.trim().toLowerCase()
      }
      if (search?.isAnime === true || search?.isAnime === 'true') result.isAnime = true
      if (search?.isAnime === false || search?.isAnime === 'false') result.isAnime = false
      return result
    },
    loader: ({ context, params, location }) => {
      safePrefetchChunk(() => import('./pages/genre-page'))
      const search = location.search as GenreSearchParams
      const mediaType = search?.type
      const genreId = params.genreId || 'action'
      const genreFilter = search?.genres || genreId
      const language =
        search?.language && search.language !== 'all' ? search.language : undefined
      void context.queryClient.prefetchInfiniteQuery(
        mediaQueries.infiniteList({
          type: mediaType,
          genre: genreFilter,
          sortBy: search?.sort || 'popularity',
          sortDir: search?.dir || 'desc',
          certification: search?.certification,
          language,
          isAnime: mediaType === 'game' ? undefined : search?.isAnime,
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
