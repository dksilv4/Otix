import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const WelcomePage = safeLazy(() =>
  import('./pages/welcome-page').then((m) => ({ default: m.WelcomePage })),
)

export function createWelcomeRoutes(rootRoute: AnyRoute) {
  const welcomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    component: WelcomePage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/welcome-page'))
    },
  })

  return [welcomeRoute]
}
