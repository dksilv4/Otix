import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const WelcomePage = lazy(() =>
  import('./pages/welcome-page').then((m) => ({ default: m.WelcomePage })),
)

export function createWelcomeRoutes(rootRoute: AnyRoute) {
  const welcomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    component: WelcomePage,
    loader: () => {
      void import('./pages/welcome-page')
    },
  })

  return [welcomeRoute]
}
