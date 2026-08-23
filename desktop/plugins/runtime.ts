// desktop/plugins/runtime.ts
import { Worker } from 'worker_threads'
import path from 'path'
import type { PluginManifest, PluginPermission } from './types'
import { createWorkerBridge, type BridgeDependencies } from './worker-bridge'
import { IsolatedEventBus } from './event-bus'
import {
  getPluginsDb,
  ensureSchema,
  migratePluginData,
} from '../db/plugins-db'

export class PluginRuntime {
  public readonly pluginId: string
  public readonly manifest: PluginManifest
  public readonly dbConfig: PluginManifest['db'] | null
  private worker: Worker | null = null
  private bridge: Awaited<ReturnType<typeof createWorkerBridge>> | null = null
  private bridgeDeps: BridgeDependencies | null = null
  private destroyed = false

  constructor(
    pluginId: string,
    manifest: PluginManifest,
    private pluginDir: string,
    private eventBus: IsolatedEventBus,
    private permissionCheck: (perm: PluginPermission) => boolean,
    private permissionRequest: (perm: PluginPermission) => Promise<boolean>,
    private configStore: {
      getAll(): Record<string, unknown>
      get(key: string): unknown
      set(key: string, value: unknown): void
    },
    private apiBaseUrl: string,
    private authToken: string,
    private callPlugin: (targetId: string, method: string, args: any) => Promise<any>,
    private serviceRegistry: import('./service-registry').ServiceRegistry,
  ) {
    this.pluginId = pluginId
    this.manifest = manifest
    this.dbConfig = manifest.db || null
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error('Runtime destroyed')

    // Shared DB — auto-migrate schema and data
    const dbConfig = this.manifest.db
    if (dbConfig) {
      ensureSchema(this.pluginId, dbConfig)
      migratePluginData(this.pluginId, this.pluginDir, dbConfig)
    }

    // Spawn worker
    const mainPath = path.join(this.pluginDir, this.manifest.entry.main)
    this.worker = new Worker(
      path.join(__dirname, 'worker.js'),
      { workerData: { pluginPath: mainPath } }
    )

    this.worker.on('error', (err) => {
      console.error(`[plugin:${this.pluginId}] Worker error:`, err)
    })

    this.worker.on('exit', (code) => {
      if (code !== 0 && !this.destroyed) {
        console.error(`[plugin:${this.pluginId}] Worker exited with code ${code}`)
      }
    })

    // Create bridge — shared DB with auto-prefixing
    const bridgeDeps: BridgeDependencies = {
      pluginId: this.pluginId,
      manifest: this.manifest,
      worker: this.worker,
      eventBus: this.eventBus,
      pluginDb: getPluginsDb(),
      dbConfig: this.dbConfig,
      hasPermission: this.permissionCheck,
      requestPermission: this.permissionRequest,
      apiBaseUrl: this.apiBaseUrl,
      authToken: this.authToken,
      getConfig: () => this.configStore.getAll(),
      getConfigValue: (key: string) => this.configStore.get(key),
      setConfigValue: (key: string, value: unknown) => this.configStore.set(key, value),
      callPlugin: this.callPlugin,
      serviceRegistry: this.serviceRegistry,
    }

    this.bridgeDeps = bridgeDeps
    this.bridge = createWorkerBridge(bridgeDeps)
    await this.bridge.start()
  }

  // Keep the live bridge deps in sync when the renderer refreshes its Otix
  // access token / backend URL. Without this, workers keep sending the token
  // captured at start() and auth'd ctx.api calls 401 after expiry/refresh.
  setAuthToken(token: string): void {
    this.authToken = token
    if (this.bridgeDeps) this.bridgeDeps.authToken = token
  }

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url
    if (this.bridgeDeps) this.bridgeDeps.apiBaseUrl = url
  }

  async callMethod(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.bridge) throw new Error('Runtime not started')
    return this.bridge.callMethod(method, ...args)
  }

  /** Push an updated config snapshot to the running worker. */
  pushConfig(config: Record<string, unknown>): void {
    this.bridge?.pushConfig(config)
  }

  async stop(): Promise<void> {
    this.destroyed = true

    // Stop bridge and terminate worker
    if (this.bridge) {
      try { await this.bridge.stop() } catch {}
      this.bridge = null
    }

    // Shared DB is managed globally, do NOT close it here
    this.worker = null
  }
}
