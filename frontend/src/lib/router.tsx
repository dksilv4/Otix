import { lazy, useEffect } from "react"
import { createRouter, createRootRoute, createRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { AppLayout } from "@ui/organisms/app-layout"
import { LoadingPage } from "@ui/pages/loading-page"
import { NotFoundPage } from "@/components/not-found"
import { getDesktopAPI } from "@/lib/desktop-api"

const LAST_ROUTE_KEY = 'otix:lastRoute'

/** Save current route to localStorage on every navigation. */
function useSaveLastRoute() {
  const location = useLocation()

  useEffect(() => {
    const route = location.href
    // Don't save transient/auth routes
    if (!route || route === '/' || route === '/loading' || route.startsWith('/auth')) return
    localStorage.setItem(LAST_ROUTE_KEY, route)
  }, [location.href])
}

/** Restore last route if app wasn't cleanly quit (crash/power loss). */
function useRestoreLastRoute() {
  const location = useLocation()

  useEffect(() => {
    const saved = localStorage.getItem(LAST_ROUTE_KEY)
    if (!saved) return
    if (saved === location.href) return
    // Don't redirect away from auth pages
    if (location.pathname.startsWith('/auth') || location.pathname === '/loading') return

    localStorage.removeItem(LAST_ROUTE_KEY)
    window.history.replaceState(null, '', saved)
  }, []) // only run on mount
}

/** Listen for clean-quit IPC from Electron main and clear saved route. */
function useCleanQuitSignal() {
  useEffect(() => {
    const api = getDesktopAPI()
    if (!api?.onCleanQuit) return
    const unsub = api.onCleanQuit(() => {
      localStorage.removeItem(LAST_ROUTE_KEY)
    })
    return unsub
  }, [])
}

// ── Lazy-loaded page components ──

const AuthPage = lazy(() => import("@auth/pages/auth-page").then(m => ({ default: m.AuthPage })))
const MediaDetail = lazy(() => import("@media/organisms/media-detail").then(m => ({ default: m.MediaDetail })))
const DkUiShowcase = lazy(() => import("@/features/dk-ui/showcase").then(m => ({ default: m.DkUiShowcase })))
const DashboardPage = lazy(() => import("@/features/dashboard/pages/dashboard-page").then(m => ({ default: m.DashboardPage })))
const DiscoverPage = lazy(() => import("@discover/pages/home-page").then(m => ({ default: m.DiscoverPage })))
const PersonDetail = lazy(() => import("@person/organisms/person-detail").then(m => ({ default: m.PersonDetail })))
const CompanyDetailPage = lazy(() => import("@company/pages/company-detail-page").then(m => ({ default: m.CompanyDetailPage })))
const LibraryLayout = lazy(() => import("@/features/library/pages/library-layout").then(m => ({ default: m.LibraryLayout })))
const LibraryOverviewPage = lazy(() => import("@/features/library/pages/library-overview-page").then(m => ({ default: m.LibraryOverviewPage })))
const LibraryGamesPage = lazy(() => import("@/features/library/pages/library-games-page").then(m => ({ default: m.LibraryGamesPage })))
const LibraryWatchlistPage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryWatchlistPage })))
const LibraryLikePage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryLikePage })))
const LibraryWatchedPage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryWatchedPage })))
const LibraryPlayedPage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryPlayedPage })))
const LibraryListenedPage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryListenedPage })))
const LibraryOwnedPage = lazy(() => import("@/features/library/pages/library-core-tab-pages").then(m => ({ default: m.LibraryOwnedPage })))
const LibraryIntegrationSteamSection = lazy(() => import("@/features/library/pages/library-integration-steam-section").then(m => ({ default: m.LibraryIntegrationSteamSection })))
const LibraryIntegrationPlexSection = lazy(() => import("@/features/library/pages/library-integration-plex-section").then(m => ({ default: m.LibraryIntegrationPlexSection })))
const LibraryIntegrationSpotifySection = lazy(() => import("@/features/library/pages/library-integration-spotify-section").then(m => ({ default: m.LibraryIntegrationSpotifySection })))
const LibraryWishlistPage = lazy(() => import("@/features/library/pages/library-wishlist-page").then(m => ({ default: m.LibraryWishlistPage })))
const LibraryListsPage = lazy(() => import("@/features/library/pages/library-lists-page").then(m => ({ default: m.LibraryListsPage })))
const ListDetail = lazy(() => import("@/features/list/organisms/list-detail").then(m => ({ default: m.ListDetail })))
const SettingsPage = lazy(() => import("@/features/settings/pages/settings-page").then(m => ({ default: m.SettingsPage })))
const UserProfilePage = lazy(() => import("@/features/user/pages/user-profile-page").then(m => ({ default: m.UserProfilePage })))
const WorkoutPage = lazy(() => import("@/features/workout/pages/workout-page").then(m => ({ default: m.WorkoutPage })))
const NotificationsPage = lazy(() => import("@/features/notifications/pages/notifications-page").then(m => ({ default: m.NotificationsPage })))
const BrowsePage = lazy(() => import("@/features/browse/pages/browse-page").then(m => ({ default: m.BrowsePage })))
const VerifyEmailPage = lazy(() => import("@auth/pages/auth-verify-email-page").then(m => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import("@auth/pages/auth-forgot-password-page").then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import("@auth/pages/auth-reset-password-page").then(m => ({ default: m.ResetPasswordPage })))
const CallbackPage = lazy(() => import("@auth/pages/auth-callback-page").then(m => ({ default: m.CallbackPage })))
const AdminHomePage = lazy(() => import("@/features/admin/pages/admin-home-page").then(m => ({ default: m.AdminHomePage })))
const AdminDashboardPage = lazy(() => import("@/features/admin/pages/admin-dashboard-page").then(m => ({ default: m.AdminDashboardPage })))
const AdminProposalsPage = lazy(() => import("@/features/admin/pages/admin-proposals-page").then(m => ({ default: m.AdminProposalsPage })))
const AdminExperimentsPage = lazy(() => import("@/features/admin/pages/admin-experiments-page").then(m => ({ default: m.AdminExperimentsPage })))
const AdminBlogPostPage = lazy(() => import("@/features/admin/pages/admin-blog-post-page").then(m => ({ default: m.AdminBlogPostPage })))
const AdminHydrationPage = lazy(() => import("@/features/admin/pages/admin-hydration-page").then(m => ({ default: m.AdminHydrationPage })))
const SearchPage = lazy(() => import("@discover/pages/search-page").then(m => ({ default: m.SearchPage })))
const DownloadQueuePage = lazy(() => import("@/features/downloads/organisms/download-queue").then(m => ({ default: m.DownloadQueuePage })))
const SpotifyPlaylistsPage = lazy(() => import("@/features/spotify/playlists/pages/spotify-playlists-page").then(m => ({ default: m.SpotifyPlaylistsPage })))
const SpotifyPlaylistDetailPage = lazy(() => import("@/features/spotify/playlists/pages/spotify-playlist-detail-page").then(m => ({ default: m.SpotifyPlaylistDetailPage })))
const LauncherHomePage = lazy(() => import("@/features/games/pages/launcher-home-page").then(m => ({ default: m.LauncherHomePage })))
const LauncherGamePage = lazy(() => import("@/features/games/pages/launcher-game-page").then(m => ({ default: m.LauncherGamePage })))

// ── Root — chooses layout based on route ──

function RootComponent() {
  const location = useLocation()
  const isAuthRoute = location.pathname.startsWith("/auth")

  // Last-route persistence for crash recovery
  useCleanQuitSignal()
  useSaveLastRoute()
  useRestoreLastRoute()

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
  notFoundComponent: NotFoundPage,
})

// ── Routes ──

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
})

const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover",
  component: DiscoverPage,
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
  validateSearch: (search: Record<string, unknown>) => ({
    mediaType: (search.mediaType as string) || 'all',
    role: (search.role as string) || 'all',
  } as { mediaType?: string; role?: string }),
})

const companyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/company/$companyId",
  component: CompanyDetailPage,
})

// ── Library ──

function LibraryDefault() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: "/library/overview", replace: true })
  }, [navigate])
  return <LoadingPage />
}

const libraryLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryLayout,
})

const libraryIndexRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "/",
  component: LibraryDefault,
})

const libraryOverviewRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "overview",
  component: LibraryOverviewPage,
})

const libraryGamesRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "games",
  component: LibraryGamesPage,
})

const libraryWatchlistRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "watchlist",
  component: LibraryWatchlistPage,
})

const libraryLikeRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "like",
  component: LibraryLikePage,
})

const libraryWatchedRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "watched",
  component: LibraryWatchedPage,
})

const libraryPlayedRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "played",
  component: LibraryPlayedPage,
})

const libraryListenedRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "listened",
  component: LibraryListenedPage,
})

const libraryOwnedRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "owned",
  component: LibraryOwnedPage,
})

const librarySteamRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "steam",
  component: LibraryIntegrationSteamSection,
})

const libraryPlexRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "plex",
  component: LibraryIntegrationPlexSection,
})

const librarySpotifyRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "spotify",
  component: LibraryIntegrationSpotifySection,
})

const libraryWishlistRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "wishlist",
  component: LibraryWishlistPage,
})

const libraryListsRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: "lists",
  component: LibraryListsPage,
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
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || '/',
  } as { redirect?: string }),
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

// ── Settings & User ──

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

const workoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workout",
  component: WorkoutPage,
})

// ── Auth action routes ──

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/verify-email",
  component: VerifyEmailPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/forgot-password",
  component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/reset-password",
  component: ResetPasswordPage,
})

// ── OAuth callback route ──

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback/$service",
  component: CallbackPage,
})

// ── Browse & Notifications ──

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse/$type",
  component: BrowsePage,
  validateSearch: (search: Record<string, unknown>) => ({
    sort: (search.sort as string) || 'popularity',
    genre: (search.genre as string) || '',
    certification: (search.certification as string) || '',
    company: (search.company as string) || '',
    language: (search.language as string) || '',
    isAnime: (search.isAnime as string) || '',
    dir: (search.dir as string) || 'desc',
  } as {
    sort?: string;
    genre?: string;
    certification?: string;
    company?: string;
    language?: string;
    isAnime?: string;
    dir?: string;
  }),
})

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationsPage,
})

const dkUiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dk-ui",
  component: DkUiShowcase,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminHomePage,
})

const adminDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/dashboard",
  component: AdminDashboardPage,
})

const adminProposalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/proposals",
  component: AdminProposalsPage,
})

const adminExperimentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/experiments",
  component: AdminExperimentsPage,
})

const adminBlogPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/blog/$slug",
  component: AdminBlogPostPage,
})

const adminHydrationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/hydration",
  component: AdminHydrationPage,
})

const downloadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/downloads",
  component: DownloadQueuePage,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
    type: (search.type as string) || 'all',
    sort: (search.sort as string) || '',
  } as {
    q?: string;
    type?: string;
    sort?: string;
  }),
})

const spotifyPlaylistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/spotify/playlists",
  component: SpotifyPlaylistsPage,
})

const spotifyPlaylistDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/spotify/playlists/$id",
  component: SpotifyPlaylistDetailPage,
})

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game",
  component: LauncherHomePage,
})

const gamesDetailRoute = createRoute({
  getParentRoute: () => gamesRoute,
  path: "$gameId",
  component: LauncherGamePage,
})

// ── Assemble ──

const routeTree = rootRoute.addChildren([
  homeRoute,
  discoverRoute,
  mediaDetailRoute,
  personDetailRoute,
  companyDetailRoute,
  libraryLayoutRoute.addChildren([
    libraryIndexRoute,
    libraryOverviewRoute,
    libraryGamesRoute,
    libraryWatchlistRoute,
    libraryLikeRoute,
    libraryWatchedRoute,
    libraryPlayedRoute,
    libraryListenedRoute,
    libraryOwnedRoute,
    librarySteamRoute,
    libraryPlexRoute,
    librarySpotifyRoute,
    libraryWishlistRoute,
    libraryListsRoute,
  ]),
  listDetailRoute,
  settingsRoute,
  userProfileRoute,
  loadingRoute,
  authLoginRoute,
  authRegisterRoute,
  workoutRoute,
  verifyEmailRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  callbackRoute,
  browseRoute,
  notificationsRoute,
  dkUiRoute,
  adminRoute,
  adminDashboardRoute,
  adminProposalsRoute,
  adminExperimentsRoute,
  adminBlogPostRoute,
  adminHydrationRoute,
  gamesRoute.addChildren([gamesDetailRoute]),
  searchRoute,
  downloadsRoute,
  spotifyPlaylistsRoute,
  spotifyPlaylistDetailRoute,
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
