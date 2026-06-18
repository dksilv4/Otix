import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { UserProfilePage } from '@user/pages/user-profile-page'

export function createUserRoutes(rootRoute: AnyRoute) {
  const userProfileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/u/$username',
    component: UserProfilePage,
  })

  return [userProfileRoute]
}
