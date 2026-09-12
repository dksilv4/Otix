import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FetchWorkerBridge } from '../bridge'
import type { HttpRequestOptions, HttpResponse, ProviderKeys, SseStream } from '../types'

/** Scriptable fake SSE stream the bridge's worker opens via the injected opener. */
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
    for (const l of this.closeListeners) l(undefined)
    this.frameListeners.clear()
    this.closeListeners.clear()
  }
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

const flush = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const storeFiles: string[] = []
const bridges: FetchWorkerBridge[] = []
afterEach(() => {
  for (const b of bridges.splice(0)) b.stop()
  for (const file of storeFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true })
      fs.rmSync(`${file}.tmp`, { force: true })
    } catch {}
  }
})

interface Harness {
  bridge: FetchWorkerBridge
  stream: FakeSse
  transport: ReturnType<typeof routeTransport>['transport']
  calls: HttpRequestOptions[]
  openCalls: Array<{ url: string; headers: Record<string, string> }>
}

function harness(overrides: { heartbeatMs?: number } = {}): Harness {
  const file = path.join(os.tmpdir(), `otix-fetch-bridge-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
  const stream = new FakeSse()
  const openCalls: Array<{ url: string; headers: Record<string, string> }> = []
  const opener = vi.fn((url: string, headers: Record<string, string>) => {
    openCalls.push({ url, headers })
    return stream
  })
  const { transport, calls } = routeTransport([
    { match: '/fetch/device', respond: () => json({ device_id: 'dev-1', online: true }) },
  ])
  const bridge = new FetchWorkerBridge({
    filePath: file,
    transport,
    openStream: opener,
    deviceName: 'MacBook',
    heartbeatMs: overrides.heartbeatMs ?? 1_000_000,
    reconnectBaseMs: 500,
  })
  storeFiles.push(file)
  bridges.push(bridge)
  return { bridge, stream, transport, calls, openCalls }
}

const igdbKeys: ProviderKeys = { igdb: { client_id: 'cid', client_secret: 'sec' } }

describe('FetchWorkerBridge', () => {
  it('stays stopped until the desktop is connected AND has a mirrorable key', async () => {
    const { bridge, calls, openCalls } = harness()
    bridge.start()
    await flush()
    expect(bridge.status.running).toBe(false)

    // Keys alone (no token) must not start a worker.
    bridge.setProvider('igdb', igdbKeys.igdb!)
    await flush()
    expect(bridge.status.running).toBe(false)

    // Token alone (no keys) must not start a worker either.
    const { bridge: bare } = harness()
    bare.setCredentials('http://127.0.0.1:8000', 'jwt-token')
    await flush()
    expect(bare.status.running).toBe(false)

    expect(calls.some((c) => c.url.includes('/fetch/device'))).toBe(false)
    expect(openCalls).toHaveLength(0)
  })

  it('registers a device and opens the stream once connected and keyed', async () => {
    const { bridge, calls, openCalls } = harness()
    bridge.setProvider('igdb', igdbKeys.igdb!)
    bridge.setCredentials('http://127.0.0.1:8000/', 'jwt-token')
    await flush()

    expect(bridge.status.running).toBe(true)
    const reg = calls.find((c) => c.url.includes('/fetch/device'))
    expect(reg).toBeDefined()
    expect(reg!.headers!.Authorization).toBe('Bearer jwt-token')
    const body = JSON.parse(reg!.body as string)
    expect(body.device_id).toBe(bridge.deviceId)
    expect(body.kind).toBe('desktop')
    expect(body.name).toBe('MacBook')
    expect(body.capabilities.providers).toEqual(['igdb'])
    expect(body.provider_keys.igdb).toEqual({ client_id: 'cid', client_secret: 'sec' })

    expect(openCalls).toHaveLength(1)
    expect(openCalls[0].url).toBe('http://127.0.0.1:8000/api/v1/fetch/stream')
    expect(openCalls[0].headers.Authorization).toBe('Bearer jwt-token')
  })

  it('clearing the token (logout) stops the worker', async () => {
    const { bridge, stream } = harness()
    bridge.setProvider('igdb', igdbKeys.igdb!)
    bridge.setCredentials('http://127.0.0.1:8000', 'jwt-token')
    await flush()
    expect(bridge.status.running).toBe(true)

    bridge.setCredentials('http://127.0.0.1:8000', '')
    await flush()
    expect(bridge.status.running).toBe(false)
    // Closing the stream again is harmless (worker already dropped it).
    expect(() => stream.serverClose(new Error('late'))).not.toThrow()
  })

  it('picks up a newly added provider on the next heartbeat register', async () => {
    const { bridge, calls } = harness({ heartbeatMs: 30 })
    bridge.setProvider('igdb', igdbKeys.igdb!)
    bridge.setCredentials('http://127.0.0.1:8000', 'jwt-token')
    await flush()
    const registers = () => calls.filter((c) => c.url.includes('/fetch/device'))
    expect(registers()).toHaveLength(1)

    bridge.setProvider('tmdb', { token: 'tok' })
    await sleep(120)

    const last = registers().pop()
    const body = JSON.parse(last!.body as string)
    expect(body.capabilities.providers).toEqual(['igdb', 'tmdb'])
    expect(bridge.status.advertised).toEqual(['igdb', 'tmdb'])
  })

  it('separates configured from advertised providers (unmirrorable excluded)', () => {
    const { bridge } = harness()
    bridge.setProvider('igdb', igdbKeys.igdb!)
    bridge.setProvider('fanart', { key: 'x' }) // has a key but no desktop mirror
    bridge.setProvider('tmdb', { token: 'tok' })
    expect(bridge.status.configured.sort()).toEqual(['fanart', 'igdb', 'tmdb'])
    expect(bridge.status.advertised).toEqual(['igdb', 'tmdb'])
    expect(bridge.status.deviceId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
