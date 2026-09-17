import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

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
  })

  const libraryWatchlistRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watchlist',
    component: LibraryWatchlistPage,
  })

  const libraryLikeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/like',
    component: LibraryLikePage,
  })

  const libraryWatchedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/watched',
    component: LibraryWatchedPage,
  })

  const libraryPlayedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/played',
    component: LibraryPlayedPage,
  })

  const libraryListenedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/listened',
    component: LibraryListenedPage,
  })

  const libraryOwnedRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/owned',
    component: LibraryOwnedPage,
  })

  const librarySteamRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/steam',
    component: LibraryIntegrationSteamSection,
  })

  const libraryPlexRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/plex',
    component: LibraryIntegrationPlexSection,
  })

  const libraryYoutubeRoute = createRoute({
    getParentRoute: () => libraryLayoutRoute,
    path: '/youtube',
    component: LibraryIntegrationYoutubeSection,
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
