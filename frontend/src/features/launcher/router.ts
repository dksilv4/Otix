import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { mediaQueries } from '@media/queries/media-queries'
import { popularGamesOptions } from './data/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const LauncherHomePage = safeLazy(() => import('./pages/launcher-home-page').then(m => ({ default: m.LauncherHomePage })))
const LauncherGamePage = safeLazy(() => import('./pages/launcher-game-page').then(m => ({ default: m.LauncherGamePage })))
const LauncherSlidePicker = safeLazy(() => import('./components/molecules/launcher-slide-picker').then(m => ({ default: m.LauncherSlidePicker })))
const LauncherLibraryPage = safeLazy(() => import('./pages/launcher-library-page').then(m => ({ default: m.LauncherLibraryPage })))
export function createLauncherRoutes(rootRoute: AnyRoute) {
  const launcherLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/launcher',
    component: LauncherHomePage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/launcher-home-page'))
      safePrefetchChunk(() => import('./components/molecules/launcher-slide-picker'))
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
      safePrefetchChunk(() => import('./pages/launcher-library-page'))
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
      safePrefetchChunk(() => import('./pages/launcher-game-page'))
      if (!/^\d+$/.test(params.gameId)) return
      void context.queryClient.prefetchQuery(
        mediaQueries.detail('game', params.gameId),
      )
    },
  })

  return [launcherLayoutRoute, launcherIndexRoute, launcherLibraryRoute, launcherGameRoute]
}
