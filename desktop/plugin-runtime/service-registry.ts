import type { ServiceInfo } from './types'

export class ServiceRegistry {
  private services: Map<string, ServiceInfo[]> = new Map()  // type → infos

  register(pluginId: string, type: string, methods: string[], protocol?: string, metadata?: Record<string, unknown>): void {
    if (!this.services.has(type)) this.services.set(type, [])
    const existing = this.services.get(type)!
    if (existing.some(s => s.pluginId === pluginId && s.protocol === protocol)) return
    existing.push({ pluginId, type, protocol, methods, metadata })
  }

  unregister(pluginId: string): void {
    for (const [type, infos] of this.services) {
      this.services.set(type, infos.filter(s => s.pluginId !== pluginId))
    }
  }

  discover(type: string): ServiceInfo[] {
    return this.services.get(type) || []
  }

  discoverOne(type: string): ServiceInfo | null {
    return this.discover(type)[0] || null
  }

  hasService(pluginId: string): string[] {
    const types: string[] = []
    for (const [type, infos] of this.services) {
      if (infos.some(s => s.pluginId === pluginId)) types.push(type)
    }
    return types
  }
}
