import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { libraryTabQueryOptions, type LibraryTab } from './library-queries'

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

function libraryTabLoader(tab: LibraryTab) {
  return ({ context }: { context: { queryClient: QueryClient } }) =>
    context.queryClient.ensureInfiniteQueryData(libraryTabQueryOptions(tab))
}

export function createLibraryRoutes(rootRoute: AnyRoute) {
  const libraryLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: LibraryLayout,
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
    loader: libraryTabLoader('overview'),
  })

  const libraryWatchlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watchlist',
    component: LibraryWatchlistPage,
    loader: libraryTabLoader('watchlist'),
  })

  const libraryLikeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/like',
    component: LibraryLikePage,
    loader: libraryTabLoader('like'),
  })

  const libraryWatchedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watched',
    component: LibraryWatchedPage,
    loader: libraryTabLoader('watched'),
  })

  const libraryPlayedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/played',
    component: LibraryPlayedPage,
    loader: libraryTabLoader('played'),
  })

  const libraryListenedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/listened',
    component: LibraryListenedPage,
    loader: libraryTabLoader('listened'),
  })

  const libraryOwnedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/owned',
    component: LibraryOwnedPage,
    loader: libraryTabLoader('owned'),
  })

  const librarySteamRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/steam',
    component: LibraryIntegrationSteamSection,
    loader: libraryTabLoader('steam'),
  })

  const libraryPlexRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/plex',
    component: LibraryIntegrationPlexSection,
    loader: libraryTabLoader('plex'),
  })

  const libraryYoutubeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/youtube',
    component: LibraryIntegrationYoutubeSection,
    loader: libraryTabLoader('youtube'),
  })

  const libraryWishlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/wishlist',
    component: LibraryWishlistPage,
  })

  const libraryListsRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/lists',
    component: LibraryListsPage,
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
