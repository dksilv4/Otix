import { createRouter, createRootRoute } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"

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
import { createCompanyRoutes } from '@company/router'
import { createNotificationRoutes } from '@/features/notifications/router'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const routeTree = rootRoute.addChildren([
  ...createAuthRoutes(rootRoute),
  ...createCalendarRoutes(rootRoute),
  ...createDiscoverRoutes(rootRoute),
  ...createSearchRoutes(rootRoute),
  ...createMediaRoutes(rootRoute),
  ...createLauncherRoutes(rootRoute),
  ...createLibraryRoutes(rootRoute),
  ...createSettingsRoutes(rootRoute, []),
  ...createListRoutes(rootRoute),
  ...createUserRoutes(rootRoute),
  ...createPeopleRoutes(rootRoute),
  ...createCompanyRoutes(rootRoute),
  ...createNotificationRoutes(rootRoute),
])

export interface RouterContext {
  queryClient: QueryClient
  isAuthenticated: boolean
  isAuthLoaded: boolean
}

function RoutePending() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded-md bg-white/[0.06]" />
      <div className="mt-6 h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  )
}

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  defaultPreload: "intent",
  defaultPendingComponent: RoutePending,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
    context: RouterContext
  }
}
