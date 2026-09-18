import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'
import { popularGamesOptions } from './data/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'

const LauncherHomePage = lazy(() => import('./pages/launcher-home-page').then(m => ({ default: m.LauncherHomePage })))
const LauncherGamePage = lazy(() => import('./pages/launcher-game-page').then(m => ({ default: m.LauncherGamePage })))
const LauncherSlidePicker = lazy(() => import('./components/molecules/launcher-slide-picker').then(m => ({ default: m.LauncherSlidePicker })))
const LauncherLibraryPage = lazy(() => import('./pages/launcher-library-page').then(m => ({ default: m.LauncherLibraryPage })))
export function createLauncherRoutes(rootRoute: AnyRoute) {
  const launcherLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/launcher',
    component: LauncherHomePage,
    loader: () => {
      void import('./pages/launcher-home-page')
      void import('./components/molecules/launcher-slide-picker')
    },
  })

  const launcherIndexRoute = createRoute({
    getParentRoute: () => launcherLayoutRoute,
    path: '/',
    component: LauncherSlidePicker,
  })

  const launcherLibraryRoute = createRoute({
    getParentRoute: () => launcherLayoutRoute,
    path: '/library',
    component: LauncherLibraryPage,
    loader: ({ context }) => {
      void import('./pages/launcher-library-page')
      if (!hasDesktopAPI()) {
        void context.queryClient.prefetchQuery(popularGamesOptions())
      }
    },
  })

  const launcherGameRoute = createRoute({
    getParentRoute: () => launcherLayoutRoute,
    path: '/$gameId',
    component: LauncherGamePage,
    loader: ({ context, params }) => {
      void import('./pages/launcher-game-page')
      if (!/^\d+$/.test(params.gameId)) return
      void context.queryClient.prefetchQuery(
        mediaQueries.detail('game', params.gameId),
      )
    },
  })

  return [launcherLayoutRoute, launcherIndexRoute, launcherLibraryRoute, launcherGameRoute]
}
