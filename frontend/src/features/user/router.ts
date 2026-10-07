import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { userQueries } from './user-queries'

const UserProfilePage = lazy(() =>
  import('./pages/user-profile-page').then(m => ({ default: m.UserProfilePage })),
)

const UserGameActivityPage = lazy(() =>
  import('./pages/user-game-activity-page').then(m => ({ default: m.UserGameActivityPage })),
)

export function createUserRoutes(rootRoute: AnyRoute) {
  const userProfileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/u/$username',
    component: UserProfilePage,
    loader: ({ context, params }) => {
      void import('./pages/user-profile-page')
      void context.queryClient.prefetchQuery(userQueries.profile(params.username))
      void context.queryClient.prefetchQuery(userQueries.reviews(params.username))
    },
  })

  const userActivityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/u/$username/activity',
    component: UserGameActivityPage,
    loader: ({ context, params }) => {
      void import('./pages/user-game-activity-page')
      void context.queryClient.prefetchQuery(userQueries.profile(params.username))
    },
  })

  return [userProfileRoute, userActivityRoute]
}
