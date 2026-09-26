import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { libraryTabQueryOptions, steamWishlistOptions, type LibraryTab } from './library-queries'
import { userListsOptions } from '@/features/list/list-queries'
import { ACCESS_TOKEN_KEY } from '@/lib/config'

const LibraryLayout = lazy(() => import('./pages/library-layout').then(m => ({ default: m.LibraryLayout })))

// Page components
const LibraryOverviewPage = lazy(() => import('./pages/library-overview-page').then(m => ({ default: m.LibraryOverviewPage })))
const LibraryWatchlistPage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryWatchlistPage })))
const LibraryLikePage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryLikePage })))
const LibraryWatchedPage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryWatchedPage })))
const LibraryPlayedPage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryPlayedPage })))
const LibraryListenedPage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryListenedPage })))
const LibraryOwnedPage = lazy(() => import('./pages/library-core-tab-pages').then(m => ({ default: m.LibraryOwnedPage })))
const LibraryIntegrationSteamSection = lazy(() => import('./pages/library-integration-steam-section').then(m => ({ default: m.LibraryIntegrationSteamSection })))
const LibraryIntegrationPlexSection = lazy(() => import('./pages/library-integration-plex-section').then(m => ({ default: m.LibraryIntegrationPlexSection })))
const LibraryIntegrationYoutubeSection = lazy(() => import('./pages/library-integration-youtube-section').then(m => ({ default: m.LibraryIntegrationYoutubeSection })))
const LibraryWishlistPage = lazy(() => import('./pages/library-wishlist-page').then(m => ({ default: m.LibraryWishlistPage })))
const LibraryListsPage = lazy(() => import('./pages/library-lists-page').then(m => ({ default: m.LibraryListsPage })))

function libraryTabLoader(tab: LibraryTab, chunk: () => Promise<unknown>) {
  return ({ context }: { context: { queryClient: QueryClient } }) => {
    void chunk()
    void context.queryClient.prefetchInfiniteQuery(libraryTabQueryOptions(tab))
  }
}

export function createLibraryRoutes(rootRoute: AnyRoute) {
  const libraryLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: LibraryLayout,
    loader: () => {
      void import('./pages/library-layout')
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
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      void import('./pages/library-overview-page')
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchQuery(userListsOptions())
      }
    },
  })

  const coreTabChunk = () => import('./pages/library-core-tab-pages')

  const libraryWatchlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watchlist',
    component: LibraryWatchlistPage,
    loader: libraryTabLoader('watchlist', coreTabChunk),
  })

  const libraryLikeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/like',
    component: LibraryLikePage,
    loader: libraryTabLoader('like', coreTabChunk),
  })

  const libraryWatchedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watched',
    component: LibraryWatchedPage,
    loader: libraryTabLoader('watched', coreTabChunk),
  })

  const libraryPlayedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/played',
    component: LibraryPlayedPage,
    loader: libraryTabLoader('played', coreTabChunk),
  })

  const libraryListenedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/listened',
    component: LibraryListenedPage,
    loader: libraryTabLoader('listened', coreTabChunk),
  })

  const libraryOwnedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/owned',
    component: LibraryOwnedPage,
    loader: libraryTabLoader('owned', coreTabChunk),
  })

  const librarySteamRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/steam',
    component: LibraryIntegrationSteamSection,
    loader: libraryTabLoader('steam', () => import('./pages/library-integration-steam-section')),
  })

  const libraryPlexRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/plex',
    component: LibraryIntegrationPlexSection,
    loader: libraryTabLoader('plex', () => import('./pages/library-integration-plex-section')),
  })

  const libraryYoutubeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/youtube',
    component: LibraryIntegrationYoutubeSection,
    loader: libraryTabLoader('youtube', () => import('./pages/library-integration-youtube-section')),
  })

  const libraryWishlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/wishlist',
    component: LibraryWishlistPage,
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      void import('./pages/library-wishlist-page')
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchInfiniteQuery(steamWishlistOptions())
      }
    },
  })

  const libraryListsRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/lists',
    component: LibraryListsPage,
    loader: ({ context }: { context: { queryClient: QueryClient } }) => {
      void import('./pages/library-lists-page')
      if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
        void context.queryClient.prefetchQuery(userListsOptions())
      }
    },
  })

  return [
    libraryLayoutRoute,
    libraryIndexRoute,
    libraryOverviewRoute,
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
