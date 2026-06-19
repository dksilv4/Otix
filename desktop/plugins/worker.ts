// desktop/plugins/worker.ts
import { parentPort, workerData } from 'worker_threads'
import type { WorkerToMainMessage, MainToWorkerMessage } from './types'

const { pluginPath } = workerData as { pluginPath: string }

// Pending RPC callbacks
const pending = new Map<string, (result: unknown) => void>()
let idCounter = 0

function sendMessage(msg: WorkerToMainMessage): void {
  parentPort!.postMessage(msg)
}

function rpc(method: string, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve) => {
    const id = String(++idCounter)
    pending.set(id, resolve)
    sendMessage({ type: 'rpc', id, method, args })
  })
}

// Handle responses from main process
parentPort!.on('message', (msg: MainToWorkerMessage) => {
  if (msg.type === 'rpc-result') {
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(msg.result)
    }
  } else if (msg.type === 'rpc-error') {
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(Promise.reject(new Error(msg.error)))
    }
  }
  // 'init' messages are handled during startup sequence
})

// Build the sandboxed PluginContext — every method proxies through RPC
const ctx = {
  get id() { return '' },
  get manifest() { return {} as any },
  config: {
    getAll: () => rpc('config.getAll'),
    get: <T>(key: string) => rpc('config.get', key) as Promise<T | undefined>,
    set: (key: string, value: unknown) => rpc('config.set', key, value),
  },
  events: {
    on: (event: string, handler: Function) =>
      rpc('events.on', event).then(() => {
        return () => rpc('events.off', event)
      }),
    off: (event: string, handler: Function) => rpc('events.off', event),
  },
  fetch: (url: string, init?: RequestInit) => rpc('fetch', url, init),
  db: {
    run: (sql: string, params?: unknown[]) => rpc('db.run', sql, params),
    get: <T>(sql: string, params?: unknown[]) => rpc('db.get', sql, params) as Promise<T | null>,
    all: <T>(sql: string, params?: unknown[]) => rpc('db.all', sql, params) as Promise<T[]>,
  },
  notifications: {
    send: (title: string, body: string) => rpc('notifications.send', title, body),
  },
  logger: {
    info: (msg: string, data?: unknown) =>
      sendMessage({ type: 'log', level: 'info', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
    warn: (msg: string, data?: unknown) =>
      sendMessage({ type: 'log', level: 'warn', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
    error: (msg: string, data?: unknown) =>
      sendMessage({ type: 'log', level: 'error', msg: data ? `${msg} ${JSON.stringify(data)}` : msg }),
  },
  api: {
    get: <T>(path: string) => rpc('api.get', path) as Promise<T>,
    post: <T>(path: string, data?: unknown) => rpc('api.post', path, data) as Promise<T>,
    put: <T>(path: string, data?: unknown) => rpc('api.put', path, data) as Promise<T>,
    delete: <T>(path: string) => rpc('api.delete', path) as Promise<T>,
  },
  onDestroy: (cb: () => void) => {
    rpc('onDestroy', null).catch(() => {})
  },
}

// Load and execute plugin entry module
async function start(): Promise<void> {
  try {
    // Use require to load the plugin's main entry
    const mod = require(pluginPath)
    const entry = mod.default || mod.plugin
    if (typeof entry === 'function') {
      const cleanup = entry(ctx)
      if (typeof cleanup === 'function') {
        // Store cleanup for later invocation on disable
        ;(globalThis as any).__pluginCleanup = cleanup
      }
    }
    sendMessage({ type: 'ready' })
  } catch (error: any) {
    sendMessage({ type: 'log', level: 'error', msg: `Plugin start failed: ${error.message}` })
    process.exit(1)
  }
}

start()
