import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const LauncherHomePage = lazy(() => import('./pages/launcher-home-page').then(m => ({ default: m.LauncherHomePage })))
const LauncherGamePage = lazy(() => import('./pages/launcher-game-page').then(m => ({ default: m.LauncherGamePage })))
const LauncherSlidePicker = lazy(() => import('./components/molecules/launcher-slide-picker').then(m => ({ default: m.LauncherSlidePicker })))
const LauncherLibraryPage = lazy(() => import('./pages/launcher-library-page').then(m => ({ default: m.LauncherLibraryPage })))

export function createLauncherRoutes(rootRoute: AnyRoute) {
  const launcherLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/launcher',
    component: LauncherHomePage,
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
  })

  const launcherGameRoute = createRoute({
    getParentRoute: () => launcherLayoutRoute,
    path: '/$gameId',
    component: LauncherGamePage,
  })

  return [launcherLayoutRoute, launcherIndexRoute, launcherLibraryRoute, launcherGameRoute]
}
