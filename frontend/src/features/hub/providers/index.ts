import type { CommandProvider } from '../types'
import { createNavigationProvider } from './navigation-provider'
import { createMediaProvider } from './media-provider'
import { createLauncherProvider } from './launcher-provider'
import { createIndexerProvider } from './indexer-provider'
import { createPluginsCommandProvider } from '@/features/plugins/providers/command-provider'

/**
 * Providers bundled with the hub. The launcher provider is registered
 * unconditionally — its search returns [] in the browser, so it contributes a
 * "Games" section only when running on desktop with local games. The plugins
 * provider contributes commands only when a plugin registers to the
 * `command:hub` slot.
 */
export function getDefaultHubProviders(): CommandProvider[] {
  return [
    createNavigationProvider(),
    createMediaProvider(),
    createLauncherProvider(),
    createIndexerProvider(),
    createPluginsCommandProvider(),
  ]
}

export { createNavigationProvider } from './navigation-provider'
export { createMediaProvider } from './media-provider'
export { createLauncherProvider } from './launcher-provider'
export { createIndexerProvider } from './indexer-provider'
