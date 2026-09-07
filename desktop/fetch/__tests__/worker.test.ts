import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProxyFetchWorker } from '../worker'
import type { HttpRequestOptions, HttpResponse, ProviderKeys, SseStream } from '../types'

/** Scriptable fake SSE stream the worker opens via the injected opener. */
class FakeSse implements SseStream {
  closedByServer = false
  private frameListeners = new Set<(payload: string) => void>()
  private closeListeners = new Set<(error?: Error) => void>()

  onFrame(listener: (payload: string) => void): void {
    this.frameListeners.add(listener)
  }
  onClose(listener: (error?: Error) => void): void {
    this.closeListeners.add(listener)
  }
  close(): void {
    // Treat an explicit close as terminal: drop listeners like net.ts.
    for (const l of this.closeListeners) l(undefined)
    this.frameListeners.clear()
    this.closeListeners.clear()
  }
  /** Push a data-frame payload as if it arrived on the wire. */
  push(payload: string): void {
    for (const l of this.frameListeners) l(payload)
  }
  /** Simulate the server dropping the stream. */
  serverClose(error?: Error): void {
    this.closedByServer = true
    const listeners = [...this.closeListeners]
    this.frameListeners.clear()
    this.closeListeners.clear()
    for (const l of listeners) l(error)
  }
}

const json = (body: unknown, status = 200): HttpResponse => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

function routeTransport(routes: Array<{ match: string; respond: (req: HttpRequestOptions) => HttpResponse }>) {
  const calls: HttpRequestOptions[] = []
  const transport = vi.fn(async (req: HttpRequestOptions): Promise<HttpResponse> => {
    calls.push(req)
    const route = routes.find((r) => req.url.includes(r.match))
    if (!route) throw new Error(`no route for ${req.method} ${req.url}`)
    return route.respond(req)
  })
  return { transport, calls }
}

interface Harness {
  worker: ProxyFetchWorker
  stream: FakeSse
  transport: ReturnType<typeof routeTransport>['transport']
  calls: HttpRequestOptions[]
  openCalls: Array<{ url: string; headers: Record<string, string> }>
  opener: ReturnType<typeof routeTransport>['transport']
}

const started: ProxyFetchWorker[] = []
afterEach(() => {
  for (const w of started) w.stop()
  started.length = 0
  vi.useRealTimers()
})

function harness(keys: () => ProviderKeys, overrides: Partial<ConstructorParameters<typeof ProxyFetchWorker>[0]> = {}) {
  const stream = new FakeSse()
  const openCalls: Array<{ url: string; headers: Record<string, string> }> = []
  const opener = vi.fn((url: string, headers: Record<string, string>) => {
    openCalls.push({ url, headers })
    return stream
  })
  const { transport, calls } = routeTransport([
    { match: '/fetch/device', respond: () => json({ device_id: 'dev-1', online: true }) },
    { match: '/fetch/result', respond: () => json({ status: 'success', media_id: 42, resolved_by: 'client' }) },
    { match: 'api.themoviedb.org', respond: () => json({ id: 550, title: 'Fight Club' }) },
  ])
  const worker = new ProxyFetchWorker({
    transport,
    openStream: opener,
    apiBaseUrl: 'http://127.0.0.1:8000',
    token: 'jwt-token',
    device: { id: 'desktop-1', name: 'MacBook' },
    getKeys: keys,
    ...overrides,
  })
  return { worker, stream, transport, calls, openCalls, opener }
}

describe('ProxyFetchWorker', () => {
  it('registers the device and opens the fetch stream on start', async () => {
    const { worker, calls, openCalls, opener } = harness(() => ({ tmdb: { token: 'tok' } }))
    started.push(worker)
    const events: string[] = []
    worker.on('registered', () => events.push('registered'))
    worker.on('listening', () => events.push('listening'))

    await worker.start()

    const reg = calls.find((c) => c.url.includes('/fetch/device'))
    expect(reg).toBeDefined()
    expect(reg!.headers!.Authorization).toBe('Bearer jwt-token')
    const body = JSON.parse(reg!.body as string)
    expect(body.device_id).toBe('desktop-1')
    expect(body.kind).toBe('desktop')
    expect(body.capabilities.providers).toEqual(['tmdb'])
    expect(body.provider_keys.tmdb).toEqual({ token: 'tok' })

    expect(opener).toHaveBeenCalledTimes(1)
    expect(openCalls[0].url).toBe('http://127.0.0.1:8000/api/v1/fetch/stream')
    expect(openCalls[0].headers.Authorization).toBe('Bearer jwt-token')
    expect(events).toEqual(['registered', 'listening'])
  })

  it('fetches the raw on a fetch_request and POSTs it to /fetch/result', async () => {
    const { worker, stream, calls } = harness(() => ({ tmdb: { token: 'tok' } }))
    started.push(worker)
    const results: any[] = []
    const requests: any[] = []
    worker.on('request', (e) => requests.push(e.request))
    worker.on('result', (e) => results.push(e))

    await worker.start()
    stream.push(
      JSON.stringify({
        task_id: '101',
        provider: 'tmdb',
        entity_type: 'movie',
        external_id: '550',
      }),
    )
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ task_id: '101', provider: 'tmdb', entity_type: 'movie', external_id: '550' })

    // The provider GET (raw fetch) happened, then a result POST carried the raw.
    const providerGet = calls.find((c) => c.url.includes('api.themoviedb.org'))
    expect(providerGet).toBeDefined()
    const resultPost = calls.find((c) => c.url.includes('/fetch/result'))
    expect(resultPost).toBeDefined()
    const posted = JSON.parse(resultPost!.body as string)
    expect(posted.task_id).toBe('101')
    expect(posted.provider).toBe('tmdb')
    expect(posted.entity_type).toBe('movie')
    expect(posted.raw.title).toBe('Fight Club')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ task_id: '101', ok: true, status: 200, media_id: 42 })
  })

  it('does not advertise providers it cannot mirror when keys are absent', async () => {
    const { worker, calls, opener } = harness(() => ({ fanart: { key: 'x' } }))
    started.push(worker)
    await worker.start()
    const reg = calls.find((c) => c.url.includes('/fetch/device'))
    const body = JSON.parse(reg!.body as string)
    expect(body.capabilities.providers).toEqual([])
    expect(body.provider_keys).toEqual({})
    expect(opener).not.toHaveBeenCalled() // nothing mirrorable -> no stream
  })

  it('ignores non-fetch_request / non-JSON frames', async () => {
    const { worker, stream, calls } = harness(() => ({ tmdb: { token: 'tok' } }))
    started.push(worker)
    await worker.start()
    const deviceCalls = calls.filter((c) => c.url.includes('/fetch/device')).length
    stream.push('not json')
    stream.push(JSON.stringify({ hello: 'world' }))
    await new Promise((r) => setImmediate(r))
    expect(calls.filter((c) => c.url.includes('/fetch/result'))).toHaveLength(0)
    expect(calls.filter((c) => c.url.includes('/fetch/device')).length).toBe(deviceCalls)
  })

  it('heartbeats by re-registering on the heartbeat cadence', async () => {
    vi.useFakeTimers()
    const { worker, stream, calls } = harness(() => ({ tmdb: { token: 'tok' } }), { heartbeatMs: 60_000 })
    started.push(worker)
    await worker.start()
    const registers = () => calls.filter((c) => c.url.includes('/fetch/device')).length
    expect(registers()).toBe(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(registers()).toBe(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(registers()).toBe(3)
  })

  it('reconnects with backoff when the server drops the stream', async () => {
    vi.useFakeTimers()
    const { worker, stream, calls, opener } = harness(() => ({ tmdb: { token: 'tok' } }), {
      reconnectBaseMs: 1_000,
      reconnectMaxMs: 4_000,
    })
    started.push(worker)
    const closes: string[] = []
    const retries: any[] = []
    worker.on('stream-closed', (e) => closes.push(e.error ?? 'clean'))
    worker.on('retry', (e) => retries.push(e))

    await worker.start()
    expect(opener).toHaveBeenCalledTimes(1)
    stream.serverClose(new Error('boom'))

    expect(closes).toEqual(['boom'])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(opener).toHaveBeenCalledTimes(2) // reopened
    expect(retries.some((r) => r.reason === 'stream-closed')).toBe(true)
  })

  it('stop() tears down the stream and running state', async () => {
    const { worker, stream } = harness(() => ({ tmdb: { token: 'tok' } }))
    started.push(worker)
    const stopped: any[] = []
    worker.on('stopped', () => stopped.push(true))
    await worker.start()
    expect(worker.isRunning).toBe(true)
    worker.stop()
    expect(worker.isRunning).toBe(false)
    expect(stopped).toEqual([true])
    expect(() => stream.push(JSON.stringify({ task_id: '1', provider: 'tmdb', entity_type: 'movie', external_id: '550' }))).not.toThrow()
  })
})
