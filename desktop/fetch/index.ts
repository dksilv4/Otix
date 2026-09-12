// desktop/fetch/index.ts
// Proxy-fetch client (Phase 2.2). Public surface of the desktop companion's
// fetch worker: a headless orchestrator that registers a ClientDevice against
// the Otix backend with the user's per-provider keys, keeps the SSE fetch
// request stream open, and answers each fetch_request by fetching the raw
// provider payload with the user's local keys and POSTing it to /fetch/result
// so the server seeds the catalog without holding a provider key itself.
//
// Wire into an Otix-connected context (main.ts or an IPC start/stop handler):
//
//   const worker = createProxyFetchWorker({
//     apiBaseUrl: getApiBaseUrl(),
//     token: otixToken,
//     device: { id: INSTALL_ID, name: 'MacBook' },
//     getKeys: () => ({ tmdb: { token: settings.tmdbKey }, igdb: { client_id, client_secret } }),
//   })
//   worker.on('result', ({ task_id, ok }) => { ... })
//   await worker.start()
//   ... worker.setCredentials(newUrl, newToken) on token refresh ...
//   worker.stop()                       // on logout / window close

import { openNodeSseStream, nodeFetchTransport } from './net'
import { ProxyFetchWorker, type ProxyFetchWorkerOptions } from './worker'
import type { HttpTransport, ProviderKeys, StreamOpener } from './types'

export { ProxyFetchWorker } from './worker'
export { nodeFetchTransport, openNodeSseStream } from './net'
export { IncrementalSseParser } from './sse'
export {
  fetchSeedRaw,
  usableCapability,
  isMirrorable,
  GAME_HYDRATION_FIELDS,
  SUPPORTED_PROVIDERS,
} from './providers'
export type {
  FetchRequest,
  FetchCapability,
  ProviderKeys,
  HttpResponse,
  HttpRequestOptions,
  HttpTransport,
  SseStream,
  StreamOpener,
} from './types'

export interface CreateWorkerOptions {
  apiBaseUrl: string
  token: string
  device: { id: string; name?: string }
  getKeys: () => ProviderKeys
  transport?: HttpTransport
  openStream?: StreamOpener
  heartbeatMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  log?: (message: string) => void
}

/** Build a ProxyFetchWorker over the real Node transports. */
export function createProxyFetchWorker(options: CreateWorkerOptions): ProxyFetchWorker {
  const full: ProxyFetchWorkerOptions = {
    ...options,
    transport: options.transport ?? nodeFetchTransport,
    openStream: options.openStream ?? openNodeSseStream,
  }
  return new ProxyFetchWorker(full)
}
