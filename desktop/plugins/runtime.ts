// desktop/plugins/runtime.ts
import { Worker } from 'worker_threads'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import type { PluginManifest, PluginPermission } from './types'
import { createWorkerBridge, type BridgeDependencies } from './worker-bridge'
import { IsolatedEventBus } from './event-bus'

export class PluginRuntime {
  public readonly pluginId: string
  public readonly manifest: PluginManifest
  private worker: Worker | null = null
  private db: Database.Database | null = null
  private bridge: Awaited<ReturnType<typeof createWorkerBridge>> | null = null
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
  ) {
    this.pluginId = pluginId
    this.manifest = manifest
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error('Runtime destroyed')

    // Open plugin data database
    const dataDir = path.join(this.pluginDir, 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    this.db = new Database(path.join(dataDir, 'data.db'))
    this.db.pragma('journal_mode = WAL')

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

    // Create bridge
    const bridgeDeps: BridgeDependencies = {
      pluginId: this.pluginId,
      manifest: this.manifest,
      worker: this.worker,
      eventBus: this.eventBus,
      pluginDb: this.db,
      hasPermission: this.permissionCheck,
      requestPermission: this.permissionRequest,
      apiBaseUrl: this.apiBaseUrl,
      authToken: this.authToken,
      getConfig: () => this.configStore.getAll(),
      getConfigValue: (key: string) => this.configStore.get(key),
      setConfigValue: (key: string, value: unknown) => this.configStore.set(key, value),
    }

    this.bridge = createWorkerBridge(bridgeDeps)
    await this.bridge.start()
  }

  async callMethod(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.bridge) throw new Error('Runtime not started')
    return this.bridge.callMethod(method, ...args)
  }

  async stop(): Promise<void> {
    this.destroyed = true

    // Stop bridge and terminate worker
    if (this.bridge) {
      try { await this.bridge.stop() } catch {}
      this.bridge = null
    }

    // Close database (must happen after worker stops)
    if (this.db) {
      try { this.db.close() } catch {}
      this.db = null
    }

    this.worker = null
  }
}
