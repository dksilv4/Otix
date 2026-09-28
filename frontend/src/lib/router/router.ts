import { lazy } from "react"
import { createRouter, createRootRoute, createRoute } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"

const LogoLoadingTestPage = lazy(() =>
  import("@/pages/logo-loading-test-page").then((m) => ({ default: m.LogoLoadingTestPage })),
)

import { createAuthRoutes } from '@auth/router'
import { createDiscoverRoutes } from '@discover/router'
import { createSearchRoutes } from '@search/router'
import { createMediaRoutes } from '@media/router'
import { createCalendarRoutes } from '@calendar/router'
import { createLauncherRoutes } from '@launcher/router'
import { createLibraryRoutes } from '@library/router'
import { createSettingsRoutes } from '@settings/router'
import { createListRoutes } from '@/features/list/router'
import { createUserRoutes } from '@user/router'
import { createPeopleRoutes } from '@people/router'
import { createCharacterRoutes } from '@/features/character/router'
import { createCompanyRoutes } from '@company/router'
import { createNotificationRoutes } from '@/features/notifications/router'
import { createGenreRoutes } from '@genre/router'
import { RoutePending } from './route-pending'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const logoLoadingTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/logo-loading",
  component: LogoLoadingTestPage,
})

const routeTree = rootRoute.addChildren([
  logoLoadingTestRoute,
  ...createAuthRoutes(rootRoute),
  ...createCalendarRoutes(rootRoute),
  ...createDiscoverRoutes(rootRoute),
  ...createSearchRoutes(rootRoute),
  ...createMediaRoutes(rootRoute),
  ...createGenreRoutes(rootRoute),
  ...createLauncherRoutes(rootRoute),
  ...createLibraryRoutes(rootRoute),
  ...createSettingsRoutes(rootRoute, []),
  ...createListRoutes(rootRoute),
  ...createUserRoutes(rootRoute),
  ...createPeopleRoutes(rootRoute),
  ...createCharacterRoutes(rootRoute),
  ...createCompanyRoutes(rootRoute),
  ...createNotificationRoutes(rootRoute),
])

export interface RouterContext {
  queryClient: QueryClient
  isAuthenticated: boolean
  isAuthLoaded: boolean
}

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  defaultPreload: "intent",
  defaultPreloadDelay: 300,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 200,
  defaultPendingMinMs: 0,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
    context: RouterContext
  }
}
