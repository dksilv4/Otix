import { createRouter, createRootRoute, createRoute } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { NotFoundPage } from "@/components/not-found"
import { RootLayout } from "@/features/_config/components/layout/root-layout"
import { safeLazy } from "@/lib/utils/chunk-reload"

const LogoLoadingTestPage = safeLazy(() =>
  import("@/pages/logo-loading-test-page").then((m) => ({ default: m.LogoLoadingTestPage })),
)
const TelemetryTestPage = safeLazy(() =>
  import("@/pages/telemetry-test-page").then((m) => ({ default: m.TelemetryTestPage })),
)
const TermsPage = safeLazy(() =>
  import("@/pages/terms-page").then((m) => ({ default: m.TermsPage })),
)
const PrivacyPage = safeLazy(() =>
  import("@/pages/privacy-page").then((m) => ({ default: m.PrivacyPage })),
)
const InstallerPage = safeLazy(() =>
  import("@/features/installer").then((m) => ({ default: m.InstallerPage })),
)
const UninstallerPage = safeLazy(() =>
  import("@/features/installer").then((m) => ({ default: m.UninstallerPage })),
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
import { createFriendsRoutes } from '@/features/friends/router'
import { createDocsRoutes } from '@/features/docs/router'
import { createDownloadRoutes } from '@/features/download-page/router'
import { createGameServersRoutes } from '@/features/gameservers/router'
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

const installerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/installer",
  component: InstallerPage,
})

const uninstallerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/uninstaller",
  component: UninstallerPage,
})

const routeTree = rootRoute.addChildren([
  logoLoadingTestRoute,
  telemetryTestRoute,
  termsRoute,
  privacyRoute,
  installerRoute,
  uninstallerRoute,
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
  ...createFriendsRoutes(rootRoute),
  ...createWelcomeRoutes(rootRoute),
  ...createDocsRoutes(rootRoute),
  ...createDownloadRoutes(rootRoute),
  ...createGameServersRoutes(rootRoute),
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
  defaultPreloadDelay: 50,
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
