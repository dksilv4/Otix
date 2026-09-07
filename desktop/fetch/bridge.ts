// desktop/fetch/bridge.ts
// Main-process coordinator that makes the headless ProxyFetchWorker (Phase 2.2)
// actually live (Phase 2.2b). It owns the durable FetchClientStore (device_id +
// per-provider keys), builds the worker over the real Node transports, and
// start/stops it to match Otix connection state: a worker only runs once the
// renderer has reported an auth token AND the store has at least one provider
// the client can mirror, so a keyless/offline desktop never registers or holds
// an SSE stream. Credentials arrive renderer -> pluginManager.setAuthToken ->
// bridge.setCredentials (wired in main.ts); provider keys are persisted via
// setProvider (seeded from existing plugin config in main, editable later).
// Transport/stream/key I/O is injectable so the lifecycle is testable headless.

import * as os from 'node:os'
import { FetchClientStore } from './store'
import { createProxyFetchWorker } from './index'
import { usableCapability } from './providers'
import type { HttpTransport, ProviderKeys, StreamOpener } from './types'
import type { ProxyFetchWorker } from './worker'

export interface FetchWorkerBridgeOptions {
  /** userData/fetch-client.json — the durable device_id + provider-key store. */
  filePath: string
  transport?: HttpTransport
  openStream?: StreamOpener
  deviceName?: string
  heartbeatMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  log?: (message: string) => void
}

export interface FetchWorkerStatus {
  deviceId: string
  running: boolean
  /** Providers with any persisted keys (not mirrorability-filtered). */
  configured: string[]
  /** Providers the device advertises to the backend (mirrorable + keyed). */
  advertised: string[]
}

export class FetchWorkerBridge {
  private readonly store: FetchClientStore
  private readonly worker: ProxyFetchWorker
  private readonly deviceName: string
  private readonly log: (message: string) => void
  private apiBaseUrl = ''
  private token = ''

  constructor(options: FetchWorkerBridgeOptions) {
    this.store = new FetchClientStore(options.filePath)
    this.deviceName = options.deviceName ?? os.hostname()
    this.log = options.log ?? ((m) => console.log(`[fetch-worker] ${m}`))
    this.worker = createProxyFetchWorker({
      apiBaseUrl: this.apiBaseUrl,
      token: '',
      device: { id: this.store.deviceId, name: this.deviceName },
      getKeys: () => this.store.providers,
      transport: options.transport,
      openStream: options.openStream,
      heartbeatMs: options.heartbeatMs,
      reconnectBaseMs: options.reconnectBaseMs,
      reconnectMaxMs: options.reconnectMaxMs,
    })
    // Surface worker outcomes through the same log sink so main sees proxy-fetch
    // traffic without wiring per-event handlers.
    this.worker.on('registered', (e) => {
      this.log(`registered device=${e.device_id} online=${e.online} providers=${e.providers.join(',') || '(none)'}`)
    })
    this.worker.on('result', (e) => {
      this.log(`result task=${e.task_id} ${e.provider}:${e.entity_type} ok=${e.ok} status=${e.status}`)
    })
    this.worker.on('error', (e) => {
      this.log(`error context=${e.context}${e.task_id ? ` task=${e.task_id}` : ''} ${e.message}`)
    })
  }

  get deviceId(): string {
    return this.store.deviceId
  }

  /** Providers that currently have keys persisted in the store. */
  get configured(): string[] {
    return Object.keys(this.store.providers).filter(
      (p) => this.store.providers[p] && Object.keys(this.store.providers[p]).length > 0,
    )
  }

  /** Providers the device would advertise (mirrorable + usable keys). */
  get advertised(): string[] {
    return usableCapability(this.store.providers).providers
  }

  get status(): FetchWorkerStatus {
    return {
      deviceId: this.store.deviceId,
      running: this.worker.isRunning,
      configured: this.configured,
      advertised: this.advertised,
    }
  }

  /** Persist/replace a provider's keys; live once the worker next re-registers. */
  setProvider(provider: string, keys: Record<string, string> | undefined): void {
    this.store.setProvider(provider, keys)
    this.log(
      `keys ${keys && Object.keys(keys).length > 0 ? 'updated' : 'cleared'} for ${provider} ` +
        `(configured=${this.configured.join(',') || '(none)'}, advertised=${this.advertised.join(',') || '(none)'})`,
    )
    this._sync()
  }

  /** Fired whenever the renderer reports an Otix auth token (login/logout/refresh). */
  setCredentials(apiBaseUrl: string, token: string): void {
    const url = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : ''
    if (url !== this.apiBaseUrl || token !== this.token) {
      this.apiBaseUrl = url
      this.token = token
      // Worker holds an empty URL until first credentials; give it a concrete
      // default so setCredentials before start still carries a valid base.
      this.worker.setCredentials(url || 'http://127.0.0.1:8000', token)
    }
    this._sync()
  }

  /** Start serving proxy-fetch jobs (no-op unless connected + keyed). */
  start(): void {
    this._sync()
  }

  /** Stop the worker and drop the stream/registration timers. */
  stop(): void {
    this.worker.stop()
  }

  private _sync(): void {
    if (this.token !== '' && this.apiBaseUrl !== '' && this.advertised.length > 0) {
      this.worker.start().catch(() => {})
    } else {
      this.worker.stop()
    }
  }
}
