import { createRouter, createRootRoute, createRouteMask } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"

import { createAuthRoutes } from '@auth/auth.router'
import { createDiscoverRoutes } from '@discover/discover.router'
import { createSearchRoutes } from '@search/search.router'
import { createMediaRoutes } from '@media/media.router'
import { createLauncherRoutes } from '@launcher/launcher.router'
import { createSettingsRoutes } from '@settings/settings.router'
import { createListRoutes } from '@/features/list/list.router'
import { createUserRoutes } from '@user/user.router'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const routeTree = rootRoute.addChildren([
  ...createAuthRoutes(rootRoute),
  ...createDiscoverRoutes(rootRoute),
  ...createSearchRoutes(rootRoute),
  ...createMediaRoutes(rootRoute),
  ...createLauncherRoutes(rootRoute),
  ...createSettingsRoutes(rootRoute),
  ...createListRoutes(rootRoute),
  ...createUserRoutes(rootRoute),
])

export interface RouterContext {
  queryClient: QueryClient
}

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  defaultPreload: "intent",
  defaultPendingComponent: () => null,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
    context: RouterContext
  }
}
