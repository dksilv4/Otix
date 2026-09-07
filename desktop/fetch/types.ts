// desktop/fetch/types.ts
// Wire types for the proxy-fetch client (Phase 2.2). Mirrors the backend
// surface under /api/v1/fetch/* (apps/integrations): a connected device holds
// the user's per-provider keys, keeps the SSE request stream open, and POSTs
// the raw provider payloads it fetches back to /fetch/result so the server's
// seed services can run without a server-side provider key.

/** A fetch_request frame published by the dispatcher on the user's SSE channel. */
export interface FetchRequest {
  task_id: string
  provider: string
  entity_type: string
  external_id: string
}

/** Per-provider key maps, e.g. { tmdb: { token }, igdb: { client_id, client_secret } }. */
export type ProviderKeys = Record<string, Record<string, string>>

/** The subset of a user's keys the desktop can actually mirror + advertise. */
export interface FetchCapability {
  provider_keys: ProviderKeys
  providers: string[]
}

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

/** One-shot request/response seam — injected so tests never hit the network. */
export type HttpTransport = (opts: HttpRequestOptions) => Promise<HttpResponse>

/** An open, incremental SSE stream of complete message frames. */
export interface SseStream {
  onFrame(listener: (payload: string) => void): void
  onClose(listener: (error?: Error) => void): void
  close(): void
}

/** Opens a persistent text/event-stream with the given request headers. */
export type StreamOpener = (url: string, headers: Record<string, string>) => SseStream

export interface DeviceRegistrationResult {
  device_id: string
  online: boolean
}
