import { createElement } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { PluginSettingsTab } from '@/features/_config/slots'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'
import { DEFAULT_SETTINGS_SECTION, getLastSettingsSection, NAV_ITEMS } from './constants'

const SettingsLayout = safeLazy(() =>
  import('./pages/settings-layout').then((m) => ({ default: m.SettingsLayout })),
)
const PluginSettingsPage = safeLazy(() =>
  import('@/features/plugins/components/PluginSettingsPage').then((m) => ({ default: m.PluginSettingsPage })),
)
const PluginSettingsTabRoute = safeLazy(() =>
  import('@/features/plugins/components/PluginSettingsTabRoute').then((m) => ({ default: m.PluginSettingsTabRoute })),
)

const SettingsProfilePage = safeLazy(() =>
  import('./pages/settings-profile-page').then((m) => ({ default: m.SettingsProfilePage })),
)
const SettingsAccountPage = safeLazy(() =>
  import('./pages/settings-account-page').then((m) => ({ default: m.SettingsAccountPage })),
)
const SettingsAppearancePage = safeLazy(() =>
  import('./pages/settings-appearance-page').then((m) => ({ default: m.SettingsAppearancePage })),
)
const SettingsLauncherPage = safeLazy(() =>
  import('./pages/settings-launcher-page').then((m) => ({ default: m.SettingsLauncherPage })),
)
const SettingsNodesPage = safeLazy(() =>
  import('./pages/settings-desktop-page').then((m) => ({ default: m.SettingsNodesPage })),
)
const SettingsNodeDetailPage = safeLazy(() =>
  import('./pages/settings-node-detail-page').then((m) => ({ default: m.SettingsNodeDetailPage })),
)
const SettingsNotificationsPage = safeLazy(() =>
  import('./pages/settings-notifications-page').then((m) => ({ default: m.SettingsNotificationsPage })),
)
const SettingsIntegrationsPage = safeLazy(() =>
  import('./pages/settings-integrations-page').then((m) => ({ default: m.SettingsIntegrationsPage })),
)
const SettingsStoragePage = safeLazy(() =>
  import('./pages/settings-storage-page').then((m) => ({ default: m.SettingsStoragePage })),
)
const SettingsLibraryPage = safeLazy(() =>
  import('./pages/settings-library-page').then((m) => ({ default: m.SettingsLibraryPage })),
)
const SettingsGameServersPage = safeLazy(() =>
  import('./pages/settings-game-servers-page').then((m) => ({ default: m.SettingsGameServersPage })),
)
const SettingsPluginsPage = safeLazy(() =>
  import('@/features/plugins/pages/plugins-page').then((m) => ({ default: m.SettingsPluginsPage })),
)

function preload(load: () => Promise<unknown>) {
  return () => {
    safePrefetchChunk(load)
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
    loader: preload(() => import('./pages/settings-layout')),
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

  const settingsDesktopRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/desktop',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes' })
    },
  })

  const settingsNodesRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/nodes',
    component: SettingsNodesPage,
    loader: preload(() => import('./pages/settings-desktop-page')),
  })

  const settingsNodeDetailRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/nodes/$nodeId',
    component: SettingsNodeDetailPage,
    loader: preload(() => import('./pages/settings-node-detail-page')),
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

  const settingsGameServersRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/game-servers',
    component: SettingsGameServersPage,
    loader: preload(() => import('./pages/settings-game-servers-page')),
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
      throw redirect({ to: '/settings/nodes' })
    },
  })

  const pluginRoutes = (pluginTabs || []).map((tab) =>
    createRoute({
      getParentRoute: () => settingsRoute,
      path: tab.path.replace('/settings/', ''),
      component: () => createElement(PluginSettingsPage, { tab }),
      loader: preload(() => import('@/features/plugins/components/PluginSettingsPage')),
    }),
  )

  const pluginSettingsTabRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '$tabId',
    component: PluginSettingsTabRoute,
    loader: preload(() => import('@/features/plugins/components/PluginSettingsTabRoute')),
  })

  return [
    settingsRoute.addChildren([
      settingsIndexRoute,
      settingsOverviewRedirect,
      settingsGeneralRedirect,
      settingsDesktopRedirect,
      settingsNodesRoute,
      settingsNodeDetailRoute,
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
      settingsGameServersRoute,
      settingsDownloadsRedirect,
      settingsPluginsRoute,
      settingsStorageRoute,
      ...pluginRoutes,
      pluginSettingsTabRoute,
    ]),
  ]
}
