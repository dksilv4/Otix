import { createRouter, createRootRoute } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { LoadingPage } from "@ui/pages/loading-page"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"

import { createAuthRoutes } from '@auth/auth.router'
import { createDiscoverRoutes } from '@discover/discover.router'
import { createSearchRoutes } from '@search/search.router'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const routeTree = rootRoute.addChildren([
  ...createAuthRoutes(rootRoute),
  ...createDiscoverRoutes(rootRoute),
  ...createSearchRoutes(rootRoute),
])

export interface RouterContext {
  queryClient: QueryClient
}

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  defaultPreload: "intent",
  defaultPendingComponent: LoadingPage,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
    context: RouterContext
  }
}
