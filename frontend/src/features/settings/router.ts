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
const SettingsGeneralPage = safeLazy(() =>
  import('./pages/settings-general-page').then((m) => ({ default: m.SettingsGeneralPage })),
)
const SettingsAppearancePage = safeLazy(() =>
  import('./pages/settings-appearance-page').then((m) => ({ default: m.SettingsAppearancePage })),
)
const SettingsRecommendationsPage = safeLazy(() =>
  import('./pages/settings-recommendations-page').then((m) => ({ default: m.SettingsRecommendationsPage })),
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
const SettingsOrganizePage = safeLazy(() =>
  import('./pages/settings-organize-page').then((m) => ({ default: m.SettingsOrganizePage })),
)
const SettingsPathsPage = safeLazy(() =>
  import('./pages/settings-paths-page').then((m) => ({ default: m.SettingsPathsPage })),
)
const SettingsProposalsPage = safeLazy(() =>
  import('./pages/settings-proposals-page').then((m) => ({ default: m.SettingsProposalsPage })),
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

  const settingsGeneralRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/general',
    component: SettingsGeneralPage,

    loader: preload(() => import('./pages/settings-general-page')),
  })

  const settingsRecommendationsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/recommendations',
    component: SettingsRecommendationsPage,

    loader: preload(() => import('./pages/settings-recommendations-page')),
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

  const settingsNodesPathsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/nodes/paths',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'paths' })
    },
  })

  const settingsNodesOrganizeRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/nodes/organize',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'organize' })
    },
  })

  const settingsNodesProposalsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/nodes/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'proposals' })
    },
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

  

  const settingsAdminProposalsRedirect = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/admin/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'proposals' })
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

  const settingsOrganizeRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/organize',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'organize' })
    },
  })

  const settingsPathsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/paths',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'paths' })
    },
  })

  const settingsProposalsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/proposals',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'proposals' })
    },
  })

  const settingsLibraryRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library',
    beforeLoad: ({ location }) => {
      const hash = location.hash?.replace(/^#/, '').toLowerCase()
      if (hash === 'paths') throw redirect({ to: '/settings/nodes', hash: 'paths' })
      if (hash === 'proposals') throw redirect({ to: '/settings/nodes', hash: 'proposals' })
      throw redirect({ to: '/settings/nodes', hash: 'organize' })
    },
  })


  const settingsGameServersRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/game-servers',
    beforeLoad: () => {
      throw redirect({ to: '/settings/nodes', hash: 'game-servers' })
    },
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
      settingsGeneralRoute,
      settingsRecommendationsRoute,
      settingsDesktopRedirect,
      settingsNodesRoute,
      settingsNodesPathsRedirect,
      settingsNodesOrganizeRedirect,
      settingsNodesProposalsRedirect,
      settingsNodeDetailRoute,
      settingsIntegrationsRedirect,
      settingsAdminProposalsRedirect,
      
      settingsProfileRoute,
      settingsAccountRoute,
      settingsAppearanceRoute,
      settingsLauncherRoute,
      settingsNotificationsRoute,
      settingsConnectionsRoute,
      settingsLibraryRoute,
      settingsOrganizeRoute,
      settingsPathsRoute,
      settingsProposalsRoute,
      settingsGameServersRoute,
      settingsDownloadsRedirect,
      settingsPluginsRoute,
      settingsStorageRoute,
      ...pluginRoutes,
      pluginSettingsTabRoute,
    ]),
  ]
}
