// desktop/fetch/worker.ts
// Proxy-fetch client orchestration (Phase 2.2). A ``ProxyFetchWorker`` keeps a
// device registered against the Otix backend, holds the persistent SSE fetch
// request stream open, and for each ``fetch_request`` the sync dispatcher parks
// (a SyncJob the server cannot fetch because it lacks that provider's key) runs
// the matching provider mirror with the user's local keys and POSTs the raw
// payload back to /api/v1/fetch/result — where the server seeds the catalog and
// completes the job.
//
// All I/O is injected (HttpTransport + StreamOpener) so the orchestrator is
// testable headlessly; desktop/fetch/net.ts supplies the real Node transport and
// desktop/fetch/index.ts wires a default factory. The worker only advertises
// providers it can actually mirror with a configured key, so the dispatcher
// never parks a job this client cannot serve.

import { EventEmitter } from 'events'
import { fetchSeedRaw, usableCapability } from './providers'
import type {
  DeviceRegistrationResult,
  FetchCapability,
  FetchRequest,
  HttpTransport,
  ProviderKeys,
  SseStream,
  StreamOpener,
} from './types'

export interface ProxyFetchWorkerOptions {
  transport: HttpTransport
  openStream: StreamOpener
  apiBaseUrl: string
  token: string
  device: { id: string; name?: string }
  /** Live per-provider key map; re-read every register/heartbeat/handle. */
  getKeys: () => ProviderKeys
  /** Raw fetcher override for tests; defaults to the provider mirrors. */
  fetchRaw?: typeof fetchSeedRaw
  heartbeatMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  log?: (message: string) => void
}

const DEFAULT_HEARTBEAT_MS = 60_000
const DEFAULT_RECONNECT_BASE_MS = 1_000
const DEFAULT_RECONNECT_MAX_MS = 15_000

export class ProxyFetchWorker extends EventEmitter {
  private readonly transport: HttpTransport
  private readonly openStream: StreamOpener
  private readonly device: { id: string; name?: string }
  private readonly getKeys: () => ProviderKeys
  private readonly fetchRaw: typeof fetchSeedRaw
  private readonly heartbeatMs: number
  private readonly reconnectBaseMs: number
  private readonly reconnectMaxMs: number
  private readonly log: (message: string) => void

  private apiBaseUrl: string
  private token: string

  private running = false
  private timer: NodeJS.Timeout | null = null
  private reconnectAttempt = 0
  private stream: SseStream | null = null
  private busy: Promise<void> = Promise.resolve()
  private readonly handling = new Set<string>()

  constructor(options: ProxyFetchWorkerOptions) {
    super()
    this.transport = options.transport
    this.openStream = options.openStream
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '')
    this.token = options.token
    this.device = options.device
    this.getKeys = options.getKeys
    this.fetchRaw = options.fetchRaw ?? fetchSeedRaw
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS
    this.log = options.log ?? (() => {})
  }

  /** Swap the backend URL / auth token live (e.g. renderer token refresh). */
  setCredentials(apiBaseUrl: string, token: string): void {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
    this.token = token
  }

  get isRunning(): boolean {
    return this.running
  }

  /** Begin registration + stream listening. Resolves after the first register. */
  start(): Promise<void> {
    if (this.running) return Promise.resolve()
    this.running = true
    this.reconnectAttempt = 0
    this.emit('started', {})
    this._clearTimer()
    return this._step('start')
  }

  /** Tear down timers + stream. */
  stop(): void {
    if (!this.running) return
    this.running = false
    this._clearTimer()
    this._closeStream()
    this.emit('stopped', {})
  }

  // ── Core loop ─────────────────────────────────────────────────────

  /** One pass: register with current keys, reconcile the stream, schedule the next. */
  private async _step(reason: string): Promise<void> {
    if (!this.running) return
    let capability: FetchCapability
    try {
      capability = await this._register(this.getKeys())
    } catch (err) {
      this.emit('error', { context: 'register', message: errorMessage(err) })
      this._schedule(this._nextDelay(), `register:${reason}`)
      return
    }
    if (!this.running) return
    if (capability.providers.length > 0) {
      // Keyed: hold the stream and heartbeat to refresh the online TTL.
      this._ensureStream()
      this._schedule(this.heartbeatMs, 'heartbeat')
    } else {
      // Keyless: drop any stream and keep polling so configuring a provider
      // later starts serving without a reconnect.
      this._closeStream()
      this._schedule(this.heartbeatMs, 'no-keys')
    }
  }

  private async _register(keys: ProviderKeys): Promise<FetchCapability> {
    const capability = usableCapability(keys)
    const body = JSON.stringify({
      device_id: this.device.id,
      kind: 'desktop',
      name: this.device.name ?? '',
      provider_keys: capability.provider_keys,
      capabilities: { providers: capability.providers },
    })
    const res = await this.transport({
      method: 'POST',
      url: this._api('/api/v1/fetch/device'),
      headers: this._apiHeaders(),
      body,
      timeoutMs: 15_000,
    })
    if (res.status !== 200) {
      throw new Error(`device registration failed (HTTP ${res.status})`)
    }
    this.reconnectAttempt = 0
    let parsed: Partial<DeviceRegistrationResult>
    try {
      parsed = JSON.parse(res.body) as Partial<DeviceRegistrationResult>
    } catch {
      parsed = {}
    }
    this.emit('registered', {
      device_id: parsed.device_id ?? this.device.id,
      online: parsed.online ?? false,
      providers: capability.providers,
    })
    return capability
  }

  private _ensureStream(): void {
    if (this.stream) return
    const stream = this.openStream(this._api('/api/v1/fetch/stream'), {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${this.token}`,
    })
    this.stream = stream
    stream.onFrame((payload) => this._onFrame(payload))
    stream.onClose((error) => this._onStreamClose(error))
    this.emit('listening', {})
    this.log('[fetch-worker] listening for fetch requests')
  }

  private _onFrame(payload: string): void {
    if (!this.running) return
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      return // non-JSON keepalive/health frame
    }
    const req = parsed as Partial<FetchRequest>
    if (
      typeof req.task_id !== 'string' ||
      typeof req.provider !== 'string' ||
      typeof req.entity_type !== 'string' ||
      typeof req.external_id !== 'string'
    ) {
      return // not a fetch_request (defensive: channel should only carry these)
    }
    const request: FetchRequest = req as FetchRequest
    if (this.handling.has(request.task_id)) return
    this.handling.add(request.task_id)
    this.emit('request', { request })
    this.log(`[fetch-worker] fetch_request task=${request.task_id} ${request.provider}:${request.entity_type}:${request.external_id}`)
    this.busy = this.busy
      .then(() => this._handle(request))
      .catch(() => {}) // _handle already isolates failures
      .finally(() => this.handling.delete(request.task_id))
  }

  private async _handle(request: FetchRequest): Promise<void> {
    let raw: Record<string, unknown>
    try {
      raw = await this.fetchRaw(this.transport, request, this.getKeys())
    } catch (err) {
      // No server-side "report client failure" channel exists yet, so a raw we
      // cannot fetch leaves the job parked awaiting_client (a server reaper is a
      // deferred follow-up). Log loudly rather than silently hanging.
      this.emit('error', { task_id: request.task_id, context: 'fetch', message: errorMessage(err) })
      this.log(`[fetch-worker] fetch failed for task=${request.task_id}: ${errorMessage(err)}`)
      return
    }
    const body = JSON.stringify({
      task_id: request.task_id,
      provider: request.provider,
      entity_type: request.entity_type,
      raw,
    })
    let res: { status: number; body: string }
    try {
      res = await this.transport({
        method: 'POST',
        url: this._api('/api/v1/fetch/result'),
        headers: this._apiHeaders(),
        body,
        timeoutMs: 60_000,
      })
    } catch (err) {
      this.emit('error', { task_id: request.task_id, context: 'result', message: errorMessage(err) })
      return
    }
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(res.body) as Record<string, unknown>
    } catch {
      parsed = {}
    }
    const ok = res.status === 200
    this.emit('result', {
      task_id: request.task_id,
      provider: request.provider,
      entity_type: request.entity_type,
      status: res.status,
      ok,
      media_id: typeof parsed.media_id === 'number' ? parsed.media_id : undefined,
      resolved_by: typeof parsed.resolved_by === 'string' ? parsed.resolved_by : undefined,
    })
    this.log(
      `[fetch-worker] result task=${request.task_id} -> HTTP ${res.status}${ok ? '' : ` ${(parsed.detail as string) ?? ''}`}`,
    )
  }

  private _onStreamClose(error?: Error): void {
    this.stream = null
    if (!this.running) return
    this.emit('stream-closed', { error: error ? errorMessage(error) : undefined })
    this._schedule(this._nextDelay(), 'stream-closed')
  }

  private _closeStream(): void {
    if (!this.stream) return
    this.stream.close()
    this.stream = null
  }

  // ── Timers / scheduling ───────────────────────────────────────────

  private _nextDelay(): number {
    const delay = Math.min(this.reconnectBaseMs * 2 ** this.reconnectAttempt, this.reconnectMaxMs)
    this.reconnectAttempt += 1
    return delay
  }

  private _schedule(delayMs: number, reason: string): void {
    this._clearTimer()
    this.emit('retry', { reason, delayMs })
    this.timer = setTimeout(() => {
      this.timer = null
      this._step(reason).catch(() => {})
    }, delayMs)
  }

  private _clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private _api(path: string): string {
    return `${this.apiBaseUrl}${path}`
  }

  private _apiHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
