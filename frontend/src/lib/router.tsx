import { createRouter, createRootRoute, createRoute, Outlet, useLocation } from "@tanstack/react-router"
import { AppLayout } from "@ui/organisms/app-layout"
import { LoadingPage } from "@ui/organisms/loading-page"
import { AuthPage } from "@auth/organisms/auth-page"
import { MediaDetail } from "@media/organisms/media-detail"
import { DkUiShowcase } from "@/features/dk-ui/showcase"
import { HomePage } from "@discover/organisms/home-page"
import { PersonDetail } from "@person/organisms/person-detail"
import { LibraryPage } from "@/features/library/library-page"
import { ListDetail } from "@/features/list/organisms/list-detail"
import { SettingsPage } from "@/features/settings/organisms/settings-page"
import { UserProfilePage } from "@/features/user/organisms/user-profile-page"

// ── Root — chooses layout based on route ──

function RootComponent() {
  const location = useLocation()
  const isAuthRoute = location.pathname.startsWith("/auth")

  if (isAuthRoute || location.pathname === "/loading") {
    return <Outlet />
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

// ── Routes ──

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})

const mediaDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/media/$mediaType/$mediaId",
  component: MediaDetail,
})

const personDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/person/$personId",
  component: PersonDetail,
})

// ── Library ──

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/$tab",
  component: LibraryPage,
})

// ── Lists ──

const listDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list/$listId",
  component: ListDetail,
})

// ── Auth routes ──

const authLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/login",
  component: AuthPage,
})

const authRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/register",
  component: AuthPage,
})

// ── Loading test ──

const loadingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/loading",
  component: LoadingPage,
})

// ── DK UI ──

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
})

const userProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/u/$username",
  component: UserProfilePage,
})

const dkUiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dk-ui",
  component: DkUiShowcase,
})

// ── Assemble ──

const routeTree = rootRoute.addChildren([
  homeRoute,
  mediaDetailRoute,
  personDetailRoute,
  libraryRoute,
  listDetailRoute,
  settingsRoute,
  userProfileRoute,
  loadingRoute,
  authLoginRoute,
  authRegisterRoute,
  dkUiRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: LoadingPage,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
