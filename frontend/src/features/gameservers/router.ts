import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const JoinGameServerPage = safeLazy(() =>
  import('./pages/join-game-server-page').then((m) => ({ default: m.JoinGameServerPage })),
)

export function createGameServersRoutes(rootRoute: AnyRoute) {
  const joinServerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/servers/join/$code',
    component: JoinGameServerPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/join-game-server-page'))
    },
  })

  const joinIndexRedirectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/servers/join',
    beforeLoad: () => {
      throw redirect({
        to: '/settings/nodes',
        hash: 'game-servers',
      })
    },
  })

  const serversRedirectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/servers',
    beforeLoad: () => {
      throw redirect({
        to: '/settings/nodes',
        hash: 'game-servers',
      })
    },
  })

  return [joinServerRoute, joinIndexRedirectRoute, serversRedirectRoute]
}
