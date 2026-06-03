import { lazy, useEffect } from "react"
import { createRouter, createRootRoute, createRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { AppLayout } from "@ui/organisms/app-layout"
import { LoadingPage } from "@ui/organisms/loading-page"

// ── Lazy-loaded page components ──

const AuthPage = lazy(() => import("@auth/organisms/auth-page").then(m => ({ default: m.AuthPage })))
const MediaDetail = lazy(() => import("@media/organisms/media-detail").then(m => ({ default: m.MediaDetail })))
const DkUiShowcase = lazy(() => import("@/features/dk-ui/showcase").then(m => ({ default: m.DkUiShowcase })))
const HomePage = lazy(() => import("@discover/organisms/home-page").then(m => ({ default: m.HomePage })))
const PersonDetail = lazy(() => import("@person/organisms/person-detail").then(m => ({ default: m.PersonDetail })))
const CompanyDetail = lazy(() => import("@company/organisms/company-detail").then(m => ({ default: m.CompanyDetail })))
const LibraryPage = lazy(() => import("@/features/library/library-page").then(m => ({ default: m.LibraryPage })))
const ListDetail = lazy(() => import("@/features/list/organisms/list-detail").then(m => ({ default: m.ListDetail })))
const SettingsPage = lazy(() => import("@/features/settings/organisms/settings-page").then(m => ({ default: m.SettingsPage })))
const UserProfilePage = lazy(() => import("@/features/user/organisms/user-profile-page").then(m => ({ default: m.UserProfilePage })))
const WorkoutPage = lazy(() => import("@/features/workout/organisms/workout-page").then(m => ({ default: m.WorkoutPage })))
const NotificationsPage = lazy(() => import("@/features/notifications/organisms/notifications-page").then(m => ({ default: m.NotificationsPage })))
const BrowsePage = lazy(() => import("@/features/browse/organisms/browse-page").then(m => ({ default: m.BrowsePage })))
const VerifyEmailPage = lazy(() => import("@auth/organisms/verify-email-page").then(m => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import("@auth/organisms/forgot-password-page").then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import("@auth/organisms/reset-password-page").then(m => ({ default: m.ResetPasswordPage })))
const SteamCallbackPage = lazy(() => import("@auth/organisms/steam-callback-page").then(m => ({ default: m.SteamCallbackPage })))
const SteamConnectCallbackPage = lazy(() => import("@auth/organisms/steam-connect-callback-page").then(m => ({ default: m.SteamConnectCallbackPage })))
const PlexConnectCallbackPage = lazy(() => import("@auth/organisms/plex-connect-callback-page").then(m => ({ default: m.PlexConnectCallbackPage })))
const SpotifyConnectCallbackPage = lazy(() => import("@auth/organisms/spotify-connect-callback-page").then(m => ({ default: m.SpotifyConnectCallbackPage })))
const GoogleConnectCallbackPage = lazy(() => import("@auth/organisms/google-connect-callback-page").then(m => ({ default: m.GoogleConnectCallbackPage })))
const TmdbConnectCallbackPage = lazy(() => import("@auth/organisms/tmdb-connect-callback-page").then(m => ({ default: m.TmdbConnectCallbackPage })))
const AdminHomePage = lazy(() => import("@/features/admin/organisms/admin-home-page").then(m => ({ default: m.AdminHomePage })))
const AdminDashboardPage = lazy(() => import("@/features/admin/organisms/admin-dashboard-page").then(m => ({ default: m.AdminDashboardPage })))
const AdminProposalsPage = lazy(() => import("@/features/admin/organisms/admin-proposals-page").then(m => ({ default: m.AdminProposalsPage })))
const AdminExperimentsPage = lazy(() => import("@/features/admin/organisms/admin-experiments-page").then(m => ({ default: m.AdminExperimentsPage })))
const AdminBlogPostPage = lazy(() => import("@/features/admin/organisms/admin-blog-post-page").then(m => ({ default: m.AdminBlogPostPage })))
const AdminHydrationPage = lazy(() => import("@/features/admin/organisms/admin-hydration-page").then(m => ({ default: m.AdminHydrationPage })))
const OnboardingPage = lazy(() => import("@/features/onboarding/organisms/onboarding-page").then(m => ({ default: m.OnboardingPage })))
const SearchPage = lazy(() => import("@discover/organisms/search-page").then(m => ({ default: m.SearchPage })))
const AboutPage = lazy(() => import("@/features/about/organisms/about-page").then(m => ({ default: m.AboutPage })))
const DownloadQueuePage = lazy(() => import("@/features/downloads/organisms/download-queue").then(m => ({ default: m.DownloadQueuePage })))

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
  validateSearch: (search: Record<string, unknown>) => ({
    type: (search.type as string) || 'all',
  } as { type?: string }),
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
  component: CompanyDetail,
})

// ── Library ──

function LibraryDefault() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: "/library/$tab", params: { tab: "overview" }, replace: true })
  }, [navigate])
  return <LoadingPage />
}

const libraryIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryDefault,
})

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

// ── OAuth callback routes ──

const steamCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/steam/callback",
  component: SteamCallbackPage,
})

const steamConnectCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/steam/connect/callback",
  component: SteamConnectCallbackPage,
})

const plexConnectCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/plex/connect/callback",
  component: PlexConnectCallbackPage,
})

const spotifyConnectCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/spotify/connect/callback",
  component: SpotifyConnectCallbackPage,
})

const tmdbConnectCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/tmdb/connect/callback",
  component: TmdbConnectCallbackPage,
})

const googleConnectCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/google/connect/callback",
  component: GoogleConnectCallbackPage,
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

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
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

// ── Assemble ──

const routeTree = rootRoute.addChildren([
  homeRoute,
  mediaDetailRoute,
  personDetailRoute,
  companyDetailRoute,
  libraryIndexRoute,
  libraryRoute,
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
  steamCallbackRoute,
  spotifyConnectCallbackRoute,
  steamConnectCallbackRoute,
  plexConnectCallbackRoute,
  tmdbConnectCallbackRoute,
  googleConnectCallbackRoute,
  browseRoute,
  notificationsRoute,
  dkUiRoute,
  adminRoute,
  adminDashboardRoute,
  adminProposalsRoute,
  adminExperimentsRoute,
  adminBlogPostRoute,
  adminHydrationRoute,
  onboardingRoute,
  searchRoute,
  aboutRoute,
  downloadsRoute,
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
