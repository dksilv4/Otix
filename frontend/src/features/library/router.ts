import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { libraryTabQueryOptions, steamWishlistOptions, type LibraryTab } from './library-queries'
import { userListsOptions } from '@/features/list/list-queries'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const LibraryLayout = safeLazy(() => import('./pages/library-layout').then(m => ({ default: m.LibraryLayout })))

// Page components
const LibraryOverviewPage = safeLazy(() => import('./pages/library-overview-page').then(m => ({ default: m.LibraryOverviewPage })))
const LibraryGamesPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryGamesPage })))
const LibraryWatchlistPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryWatchlistPage })))
const LibraryLikePage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryLikePage })))
const LibraryWatchedPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryWatchedPage })))
const LibraryPlayedPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryPlayedPage })))
const LibraryListenedPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryListenedPage })))
const LibraryOwnedPage = safeLazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryOwnedPage })))
const LibraryIntegrationSteamSection = safeLazy(() => import('./pages/library-integration-steam-section').then(m => ({ default: m.LibraryIntegrationSteamSection })))
const LibraryIntegrationPlexSection = safeLazy(() => import('./pages/library-integration-plex-section').then(m => ({ default: m.LibraryIntegrationPlexSection })))
const LibraryIntegrationYoutubeSection = safeLazy(() => import('./pages/library-integration-youtube-section').then(m => ({ default: m.LibraryIntegrationYoutubeSection })))
const LibraryWishlistPage = safeLazy(() => import('./pages/library-wishlist-page').then(m => ({ default: m.LibraryWishlistPage })))
const LibraryListsPage = safeLazy(() => import('./pages/library-lists-page').then(m => ({ default: m.LibraryListsPage })))

function libraryTabLoader(tab: LibraryTab, chunk: () => Promise<unknown>) {
  return ({ context }: { context: { queryClient: QueryClient } }) => {
    safePrefetchChunk(chunk)
    void context.queryClient.prefetchInfiniteQuery(libraryTabQueryOptions(tab))
  }
}

export function createLibraryRoutes(rootRoute: AnyRoute) {
  const libraryLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: LibraryLayout,
    loader: () => {
      safePrefetchChunk(() => import('./pages/library-layout'))
    },
  })

  const libraryIndexRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/library/overview' })
    },
  })

  const libraryOverviewRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/overview',
    component: LibraryOverviewPage,
    pendingComponent: () => null,
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      safePrefetchChunk(() => import('./pages/library-overview-page'))
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchQuery(userListsOptions())
      }
    },
  })

  const coreTabChunk = () => import('./pages/library-core-tab-pages')

  const libraryGamesRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/games',
    component: LibraryGamesPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('games', coreTabChunk),
  })

  const libraryWatchlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watchlist',
    component: LibraryWatchlistPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('watchlist', coreTabChunk),
  })

  const libraryLikeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/like',
    component: LibraryLikePage,
    pendingComponent: () => null,
    loader: libraryTabLoader('like', coreTabChunk),
  })

  const libraryWatchedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watched',
    component: LibraryWatchedPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('watched', coreTabChunk),
  })

  const libraryPlayedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/played',
    component: LibraryPlayedPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('played', coreTabChunk),
  })

  const libraryListenedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/listened',
    component: LibraryListenedPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('listened', coreTabChunk),
  })

  const libraryOwnedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/owned',
    component: LibraryOwnedPage,
    pendingComponent: () => null,
    loader: libraryTabLoader('owned', coreTabChunk),
  })

  const librarySteamRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/steam',
    component: LibraryIntegrationSteamSection,
    pendingComponent: () => null,
    loader: libraryTabLoader('steam', () => import('./pages/library-integration-steam-section')),
  })

  const libraryPlexRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/plex',
    component: LibraryIntegrationPlexSection,
    pendingComponent: () => null,
    loader: libraryTabLoader('plex', () => import('./pages/library-integration-plex-section')),
  })

  const libraryYoutubeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/youtube',
    component: LibraryIntegrationYoutubeSection,
    pendingComponent: () => null,
    loader: libraryTabLoader('youtube', () => import('./pages/library-integration-youtube-section')),
  })

  const libraryWishlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/wishlist',
    component: LibraryWishlistPage,
    pendingComponent: () => null,
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      safePrefetchChunk(() => import('./pages/library-wishlist-page'))
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchInfiniteQuery(steamWishlistOptions())
      }
    },
  })

  const libraryListsRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/lists',
    component: LibraryListsPage,
    pendingComponent: () => null,
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      safePrefetchChunk(() => import('./pages/library-lists-page'))
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchQuery(userListsOptions())
      }
    },
  })

  return [
    libraryLayoutRoute,
    libraryIndexRoute,
    libraryOverviewRoute,
    libraryGamesRoute,
    libraryWatchlistRoute,
    libraryLikeRoute,
    libraryWatchedRoute,
    libraryPlayedRoute,
    libraryListenedRoute,
    libraryOwnedRoute,
    librarySteamRoute,
    libraryPlexRoute,
    libraryYoutubeRoute,
    libraryWishlistRoute,
    libraryListsRoute,
  ]
}
