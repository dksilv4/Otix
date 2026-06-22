import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const LauncherHomePage = lazy(() => import('./pages/launcher-home-page').then(m => ({ default: m.LauncherHomePage })))
const LauncherGamePage = lazy(() => import('./pages/launcher-game-page').then(m => ({ default: m.LauncherGamePage })))
const LauncherSlidePicker = lazy(() => import('./components/molecules/launcher-slide-picker').then(m => ({ default: m.LauncherSlidePicker })))

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

  const launcherGameRoute = createRoute({
    getParentRoute: () => launcherLayoutRoute,
    path: '/$gameId',
    component: LauncherGamePage,
  })

  return [launcherLayoutRoute, launcherIndexRoute, launcherGameRoute]
}
