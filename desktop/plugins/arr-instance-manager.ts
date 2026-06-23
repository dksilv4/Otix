export interface ArrInstanceConfig {
  id: string
  name: string
  host: string
  port: number
  apiKey: string
  useSsl: boolean
  baseUrl?: string
  qualityProfile?: string
  rootFolder?: string
  enabled: boolean
}

export class ArrInstanceManager<T extends ArrInstanceConfig = ArrInstanceConfig> {
  private instances: T[] = []

  constructor(private storage: {
    getInstances: () => T[]
    saveInstances: (instances: T[]) => void
  }) {
    this.instances = storage.getInstances()
  }

  getAll(): T[] { return this.instances.filter(i => i.enabled) }

  get(id: string): T | undefined { return this.instances.find(i => i.id === id) }

  add(config: T): void {
    this.instances.push(config)
    this.storage.saveInstances(this.instances)
  }

  update(id: string, config: Partial<T>): void {
    const idx = this.instances.findIndex(i => i.id === id)
    if (idx === -1) throw new Error(`Instance not found: ${id}`)
    this.instances[idx] = { ...this.instances[idx], ...config }
    this.storage.saveInstances(this.instances)
  }

  remove(id: string): void {
    this.instances = this.instances.filter(i => i.id !== id)
    this.storage.saveInstances(this.instances)
  }

  async testConnection(config: { host: string; port: number; apiKey: string; useSsl: boolean; baseUrl?: string }): Promise<{ ok: boolean; message: string }> {
    try {
      const base = `${config.useSsl ? 'https' : 'http'}://${config.host}:${config.port}${config.baseUrl || ''}`
      const response = await fetch(`${base}/api/v3/system/status`, {
        headers: { 'X-Api-Key': config.apiKey },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }
      const data = await response.json() as any
      return { ok: true, message: `Connected (v${data.version || '?'})` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  }
}
