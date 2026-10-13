import { lazy } from "react"
import { createRouter, createRootRoute, createRoute } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"

const LogoLoadingTestPage = lazy(() =>
  import("@/pages/logo-loading-test-page").then((m) => ({ default: m.LogoLoadingTestPage })),
)
const TelemetryTestPage = lazy(() =>
  import("@/pages/telemetry-test-page").then((m) => ({ default: m.TelemetryTestPage })),
)
const TermsPage = lazy(() =>
  import("@/pages/terms-page").then((m) => ({ default: m.TermsPage })),
)
const PrivacyPage = lazy(() =>
  import("@/pages/privacy-page").then((m) => ({ default: m.PrivacyPage })),
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
import { createWelcomeRoutes } from '@/features/welcome/router'
import { RoutePending } from './route-pending'
import { RouteError } from './route-error'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
})

const logoLoadingTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/logo-loading",
  component: LogoLoadingTestPage,
})

const telemetryTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/telemetry",
  component: TelemetryTestPage,
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
})

const routeTree = rootRoute.addChildren([
  logoLoadingTestRoute,
  telemetryTestRoute,
  termsRoute,
  privacyRoute,
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
  ...createWelcomeRoutes(rootRoute),
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
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
    context: RouterContext
  }
}
