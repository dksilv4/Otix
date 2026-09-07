import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { PluginSettingsPage } from '@/features/plugins/components/PluginSettingsPage'
import { PluginSettingsTabRoute } from '@/features/plugins/components/PluginSettingsTabRoute'
import type { PluginSettingsTab } from '@/features/_config/slots'

const SettingsLayout = lazy(() => import('./pages/settings-layout').then((m) => ({ default: m.SettingsLayout })))
const SettingsOverviewPage = lazy(() =>
  import('./pages/settings-overview-page').then((m) => ({ default: m.SettingsOverviewPage })),
)
const SettingsProfilePage = lazy(() =>
  import('./pages/settings-profile-page').then((m) => ({ default: m.SettingsProfilePage })),
)
const SettingsAccountPage = lazy(() =>
  import('./pages/settings-account-page').then((m) => ({ default: m.SettingsAccountPage })),
)
const SettingsAppearancePage = lazy(() =>
  import('./pages/settings-appearance-page').then((m) => ({ default: m.SettingsAppearancePage })),
)
const SettingsNotificationsPage = lazy(() =>
  import('./pages/settings-notifications-page').then((m) => ({ default: m.SettingsNotificationsPage })),
)
const SettingsGeneralPage = lazy(() =>
  import('./pages/settings-general-page').then((m) => ({ default: m.SettingsGeneralPage })),
)
const SettingsIntegrationsPage = lazy(() =>
  import('./pages/settings-integrations-page').then((m) => ({ default: m.SettingsIntegrationsPage })),
)
const SettingsStoragePage = lazy(() =>
  import('./pages/settings-storage-page').then((m) => ({ default: m.SettingsStoragePage })),
)

const SettingsLibraryPage = lazy(() =>
  import('./pages/settings-library-page').then((m) => ({ default: m.SettingsLibraryPage })),
)
const SettingsDesktopPage = lazy(() =>
  import('./pages/settings-desktop-page').then((m) => ({ default: m.SettingsDesktopPage })),
)
const SettingsPluginsPage = lazy(() =>
  import('@/features/plugins/pages/plugins-page').then((m) => ({ default: m.SettingsPluginsPage })),
)
const SettingsScannedGamesPage = lazy(() =>
  import('./pages/settings-scanned-games-page').then((m) => ({ default: m.SettingsScannedGamesPage })),
)
const ProposalsPage = lazy(() =>
  import('@/features/proposals/pages/proposals-page').then((m) => ({ default: m.ProposalsPage })),
)

export function createSettingsRoutes(rootRoute: AnyRoute, pluginTabs?: PluginSettingsTab[]) {
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsLayout,
  })

  const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    component: SettingsOverviewPage,
  })

  const settingsOverviewRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/overview',
    component: SettingsOverviewPage,
  })

  const settingsProfileRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/profile',
    component: SettingsProfilePage,
  })

  const settingsAccountRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/account',
    component: SettingsAccountPage,
  })

  const settingsAppearanceRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/appearance',
    component: SettingsAppearancePage,
  })

  const settingsGeneralRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/general',
    component: SettingsGeneralPage,
  })

  const settingsNotificationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/notifications',
    component: SettingsNotificationsPage,
  })

  const settingsIntegrationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/integrations',
    component: SettingsIntegrationsPage,
  })

  const settingsScannedGamesRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/matching/games',
    component: SettingsScannedGamesPage,
  })

  const settingsProposalsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/proposals',
    component: ProposalsPage,
  })

  // Redirect old paths to the new /settings/proposals
  const settingsAdminProposalsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/admin/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/proposals' })
    },
  })

  const settingsLibraryRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library',
    component: SettingsLibraryPage,
  })

  const settingsDesktopRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/desktop',
    component: SettingsDesktopPage,
  })

  const settingsPluginsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/plugins',
    component: SettingsPluginsPage,
  })

  const settingsStorageRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/storage',
    component: SettingsStoragePage,
  })

  const settingsLauncherRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/launcher',
    beforeLoad: () => {
      throw redirect({ to: '/settings/general' })
    },
  })

  const pluginRoutes = (pluginTabs || []).map((tab) =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path: tab.path.replace('/settings/', ''),
      component: () => <PluginSettingsPage tab={tab} />,
    }),
  )

  // Dynamic plugin settings tab: /settings/<tabId> resolves the tab at render
  // time from the plugin manager (so enabling/disabling a plugin updates it).
  const pluginSettingsTabRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '$tabId',
    component: PluginSettingsTabRoute,
  })

  return [
    settingsRoute,
    settingsIndexRoute,
    settingsOverviewRoute,
    settingsProfileRoute,
    settingsAccountRoute,
    settingsGeneralRoute,
    settingsAppearanceRoute,
    settingsNotificationsRoute,
    settingsIntegrationsRoute,
    settingsScannedGamesRoute,
    settingsAdminProposalsRedirect,
    settingsProposalsRoute,
    settingsLibraryRoute,
    settingsDesktopRoute,
    settingsPluginsRoute,
    settingsStorageRoute,
    settingsLauncherRedirect,
    ...pluginRoutes,
    pluginSettingsTabRoute,
  ]
}
