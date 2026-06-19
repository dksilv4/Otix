import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const SettingsLayout = lazy(() => import('./pages/settings-layout').then(m => ({ default: m.SettingsLayout })))
const SettingsProfilePage = lazy(() => import('./pages/settings-profile-page').then(m => ({ default: m.SettingsProfilePage })))
const SettingsAccountPage = lazy(() => import('./pages/settings-account-page').then(m => ({ default: m.SettingsAccountPage })))
const SettingsAppearancePage = lazy(() => import('./pages/settings-appearance-page').then(m => ({ default: m.SettingsAppearancePage })))
const SettingsNotificationsPage = lazy(() => import('./pages/settings-notifications-page').then(m => ({ default: m.SettingsNotificationsPage })))
const SettingsIntegrationsPage = lazy(() => import('./pages/settings-integrations-page').then(m => ({ default: m.SettingsIntegrationsPage })))
const SettingsLibraryPage = lazy(() => import('./pages/settings-library-page').then(m => ({ default: m.SettingsLibraryPage })))
const SettingsLibraryMatchingPage = lazy(() => import('./pages/settings-library-matching-page').then(m => ({ default: m.SettingsLibraryMatchingPage })))
const SettingsDownloadsPage = lazy(() => import('./pages/settings-downloads-page').then(m => ({ default: m.SettingsDownloadsPage })))
const SettingsDesktopPage = lazy(() => import('./pages/settings-desktop-page').then(m => ({ default: m.SettingsDesktopPage })))
const SettingsPluginsPage = lazy(() => import('./pages/settings-plugins-page').then(m => ({ default: m.SettingsPluginsPage })))

export function createSettingsRoutes(rootRoute: AnyRoute) {
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsLayout,
  })

  const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/settings/profile' })
    },
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

  const settingsLibraryRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library',
    component: SettingsLibraryPage,
  })

  const settingsLibraryMatchingRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library/matching',
    component: SettingsLibraryMatchingPage,
  })

  const settingsDownloadsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/downloads',
    component: SettingsDownloadsPage,
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

  return [
    settingsRoute,
    settingsIndexRoute,
    settingsProfileRoute,
    settingsAccountRoute,
    settingsAppearanceRoute,
    settingsNotificationsRoute,
    settingsIntegrationsRoute,
    settingsLibraryRoute,
    settingsLibraryMatchingRoute,
    settingsDownloadsRoute,
    settingsDesktopRoute,
    settingsPluginsRoute,
  ]
}
