import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'
import { friendsQueries } from './queries'

const FriendsPage = safeLazy(() =>
  import('./pages/friends-page').then((m) => ({ default: m.FriendsPage })),
)

export function createFriendsRoutes(rootRoute: AnyRoute) {
  const friendsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/friends',
    component: FriendsPage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('./pages/friends-page'))
      void context.queryClient.prefetchQuery(friendsQueries.list())
      void context.queryClient.prefetchQuery(friendsQueries.incomingRequests())
      void context.queryClient.prefetchQuery(friendsQueries.activity(30))
    },
  })

  return [friendsRoute]
}
