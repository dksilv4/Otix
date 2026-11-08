import type { MediaSourceAdapter, PlayableMediaItem } from '../types'

class AdapterRegistry {
  private adapters = new Map<string, MediaSourceAdapter>()

  register(adapter: MediaSourceAdapter): void {
    this.adapters.set(adapter.id.toLowerCase(), adapter)
  }

  unregister(id: string): void {
    this.adapters.delete(id.toLowerCase())
  }

  get(id: string): MediaSourceAdapter | undefined {
    return this.adapters.get(id.toLowerCase())
  }

  resolve(item: PlayableMediaItem): MediaSourceAdapter {
    const direct = this.get(item.source)
    if (direct && direct.supports(item)) {
      return direct
    }

    for (const adapter of this.adapters.values()) {
      if (adapter.supports(item)) {
        return adapter
      }
    }

    const fallback = this.get('direct')
    if (fallback) {
      return fallback
    }

    throw new Error(`[AdapterRegistry] No media source adapter registered for source "${item.source}"`)
  }

  clear(): void {
    this.adapters.clear()
  }
}

export const adapterRegistry = new AdapterRegistry()
