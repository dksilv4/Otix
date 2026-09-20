import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { PluginSettingsPage } from '@/features/plugins/components/PluginSettingsPage'
import { PluginSettingsTabRoute } from '@/features/plugins/components/PluginSettingsTabRoute'
import type { PluginSettingsTab } from '@/features/_config/slots'
import { DEFAULT_SETTINGS_SECTION, getLastSettingsSection, NAV_ITEMS } from './constants'
import { SettingsLayout } from './pages/settings-layout'

const SettingsProfilePage = lazy(() =>
  import('./pages/settings-profile-page').then((m) => ({ default: m.SettingsProfilePage })),
)
const SettingsAccountPage = lazy(() =>
  import('./pages/settings-account-page').then((m) => ({ default: m.SettingsAccountPage })),
)
const SettingsAppearancePage = lazy(() =>
  import('./pages/settings-appearance-page').then((m) => ({ default: m.SettingsAppearancePage })),
)
const SettingsLauncherPage = lazy(() =>
  import('./pages/settings-launcher-page').then((m) => ({ default: m.SettingsLauncherPage })),
)
const SettingsDesktopPage = lazy(() =>
  import('./pages/settings-desktop-page').then((m) => ({ default: m.SettingsDesktopPage })),
)
const SettingsNotificationsPage = lazy(() =>
  import('./pages/settings-notifications-page').then((m) => ({ default: m.SettingsNotificationsPage })),
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
const SettingsPluginsPage = lazy(() =>
  import('@/features/plugins/pages/plugins-page').then((m) => ({ default: m.SettingsPluginsPage })),
)

function preload(load: () => Promise<unknown>) {
  return () => {
    void load()
  }
}

function resolveSettingsHome(): string {
  const allowed = new Set(
    NAV_ITEMS.filter((item) => !item.adminOnly).map((item) => item.id),
  )
  const last = getLastSettingsSection(allowed)
  return `/settings/${allowed.has(last) ? last : DEFAULT_SETTINGS_SECTION}`
}

export function createSettingsRoutes(rootRoute: AnyRoute, pluginTabs?: PluginSettingsTab[]) {
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsLayout,
    beforeLoad: ({ location }) => {
      const rest = location.pathname.replace(/^\/settings\/?/, '')
      if (!rest) {
        throw redirect({ to: resolveSettingsHome() })
      }
    },
  })

  const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: resolveSettingsHome() })
    },
  })

  const settingsOverviewRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/overview',
    beforeLoad: () => {
      throw redirect({ to: resolveSettingsHome() })
    },
  })

  const settingsGeneralRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/general',
    beforeLoad: () => {
      throw redirect({ to: '/settings/appearance', hash: 'general' })
    },
  })

  const settingsDesktopRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/desktop',
    component: SettingsDesktopPage,
    loader: preload(() => import('./pages/settings-desktop-page')),
  })

  const settingsLauncherRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/launcher',
    component: SettingsLauncherPage,
    loader: preload(() => import('./pages/settings-launcher-page')),
  })

  const settingsIntegrationsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/integrations',
    beforeLoad: () => {
      throw redirect({ to: '/settings/connections' })
    },
  })

  const settingsProposalsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/library', hash: 'library' })
    },
  })

  const settingsAdminProposalsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/admin/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/library', hash: 'library' })
    },
  })

  const settingsProfileRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/profile',
    component: SettingsProfilePage,
    loader: preload(() => import('./pages/settings-profile-page')),
  })

  const settingsAccountRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/account',
    component: SettingsAccountPage,
    loader: preload(() => import('./pages/settings-account-page')),
  })

  const settingsAppearanceRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/appearance',
    component: SettingsAppearancePage,
    loader: preload(() => import('./pages/settings-appearance-page')),
  })

  const settingsNotificationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/notifications',
    component: SettingsNotificationsPage,
    loader: preload(() => import('./pages/settings-notifications-page')),
  })

  const settingsConnectionsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/connections',
    component: SettingsIntegrationsPage,
    loader: preload(() => import('./pages/settings-integrations-page')),
  })

  const settingsLibraryRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library',
    component: SettingsLibraryPage,
    loader: preload(() => import('./pages/settings-library-page')),
  })

  const settingsPluginsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/plugins',
    component: SettingsPluginsPage,
    loader: preload(() => import('@/features/plugins/pages/plugins-page')),
  })

  const settingsStorageRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/storage',
    component: SettingsStoragePage,
    loader: preload(() => import('./pages/settings-storage-page')),
  })

  const settingsDownloadsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/downloads',
    beforeLoad: () => {
      throw redirect({ to: '/settings/library', hash: 'downloads' })
    },
  })

  const pluginRoutes = (pluginTabs || []).map((tab) =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path: tab.path.replace('/settings/', ''),
      component: () => <PluginSettingsPage tab={tab} />,
    }),
  )

  const pluginSettingsTabRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '$tabId',
    component: PluginSettingsTabRoute,
  })

  return [
    settingsRoute.addChildren([
      settingsIndexRoute,
      settingsOverviewRedirect,
      settingsGeneralRedirect,
      settingsDesktopRoute,
      settingsIntegrationsRedirect,
      settingsAdminProposalsRedirect,
      settingsProposalsRedirect,
      settingsProfileRoute,
      settingsAccountRoute,
      settingsAppearanceRoute,
      settingsLauncherRoute,
      settingsNotificationsRoute,
      settingsConnectionsRoute,
      settingsLibraryRoute,
      settingsDownloadsRedirect,
      settingsPluginsRoute,
      settingsStorageRoute,
      ...pluginRoutes,
      pluginSettingsTabRoute,
    ]),
  ]
}
