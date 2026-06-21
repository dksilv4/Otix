import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const DiscoverPage = lazy(() => import('@discover/pages/discover-page').then(m => ({ default: m.DiscoverPage })))

export function createDiscoverRoutes(rootRoute: AnyRoute) {
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: DiscoverPage,
  })

  return [homeRoute]
}
