import { adapterRegistry } from './registry'
import { PlexSourceAdapter } from './plex-adapter'
import { JellyfinSourceAdapter } from './jellyfin-adapter'
import { LocalSourceAdapter } from './local-adapter'
import { YouTubeSourceAdapter } from './youtube-adapter'
import { DirectSourceAdapter } from './direct-adapter'

export * from './registry'
export * from './plex-adapter'
export * from './jellyfin-adapter'
export * from './local-adapter'
export * from './youtube-adapter'
export * from './direct-adapter'

export const initDefaultAdapters = () => {
  adapterRegistry.register(new PlexSourceAdapter())
  adapterRegistry.register(new JellyfinSourceAdapter())
  adapterRegistry.register(new LocalSourceAdapter())
  adapterRegistry.register(new YouTubeSourceAdapter())
  adapterRegistry.register(new DirectSourceAdapter())
}

// Automatically initialize default adapters
initDefaultAdapters()
