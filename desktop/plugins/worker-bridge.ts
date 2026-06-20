// desktop/plugins/worker-bridge.ts
import type { Worker } from 'worker_threads'
import type { PluginPermission, MainToWorkerMessage, WorkerToMainMessage, PluginManifest } from './types'
import type { IsolatedEventBus } from './event-bus'
import Database from 'better-sqlite3'
import { PluginTimeoutError } from './errors'

const GATED_METHODS: Record<string, PluginPermission> = {
  'events.on': 'events:subscribe',
  'events.off': 'events:subscribe',
  'fetch': 'network:external',
  'api.get': 'api:proxy',
  'api.post': 'api:proxy',
  'api.put': 'api:proxy',
  'api.delete': 'api:proxy',
  'db.run': 'storage:local',
  'db.get': 'storage:local',
  'db.all': 'storage:local',
  'notifications.send': 'notifications',
}

export interface BridgeDependencies {
  pluginId: string
  manifest: PluginManifest
  worker: Worker
  eventBus: IsolatedEventBus
  pluginDb: Database.Database
  hasPermission: (permission: PluginPermission) => boolean
  requestPermission: (permission: PluginPermission) => Promise<boolean>
  apiBaseUrl: string
  authToken: string
  getConfig: () => Record<string, unknown>
  getConfigValue: (key: string) => unknown
  setConfigValue: (key: string, value: unknown) => void
}

// Module-level event subscription tracker — subscriptions from all bridges
const eventSubs = new Map<string, () => void>()
let subIdCounter = 0

export function createWorkerBridge(deps: BridgeDependencies) {
  const { pluginId, manifest, worker, eventBus, pluginDb } = deps
  let active = true
  const destroyCallbacks: (() => void)[] = []

  // Build initial context sent to worker on 'ready'
  const context = {
    pluginId,
    manifest,
    config: deps.getConfig(),
  }

  worker.on('message', async (msg: WorkerToMainMessage) => {
    if (!active) return

    if (msg.type === 'ready') {
      worker.postMessage({ type: 'init', config: context } satisfies MainToWorkerMessage)
      return
    }

    if (msg.type === 'log') {
      console.log(`[plugin:${pluginId}] [${msg.level}] ${msg.msg}`)
      return
    }

    if (msg.type === 'rpc') {
      try {
        // Permission gating
        const required = GATED_METHODS[msg.method]
        if (required) {
          if (!deps.hasPermission(required)) {
            const granted = await deps.requestPermission(required)
            if (!granted) {
              worker.postMessage({
                type: 'rpc-error', id: msg.id,
                error: `Permission denied: ${required}`,
              } satisfies MainToWorkerMessage)
              return
            }
          }
        }

        const result = await executeMethod(msg.method, msg.args, deps, pluginDb, eventBus, pluginId, worker, destroyCallbacks)
        worker.postMessage({ type: 'rpc-result', id: msg.id, result } satisfies MainToWorkerMessage)
      } catch (error: any) {
        worker.postMessage({
          type: 'rpc-error', id: msg.id, error: error.message,
        } satisfies MainToWorkerMessage)
      }
    }

    if (msg.type === 'slot-render') {
      // Reserved for PluginRuntime.slotRender() — see Task 3.3
    }

    if (msg.type === 'handle-action') {
      // Reserved for PluginRuntime.handleAction() — see Task 3.3
    }
  })

  async function start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new PluginTimeoutError(pluginId, 'startup'))
      }, (manifest as any).timeout || 30000)

      const onReady = (msg: WorkerToMainMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout)
          worker.off('message', onReady)
          resolve()
        }
      }
      worker.on('message', onReady)
    })
  }

  async function callMethod(method: string, ...args: unknown[]): Promise<unknown> {
    const id = Math.random().toString(36).slice(2)
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.off('message', handler)
        reject(new PluginTimeoutError(pluginId, method))
      }, 5000)

      const handler = (msg: WorkerToMainMessage) => {
        // The worker responds with { type: 'rpc-result', id, result }
        // or { type: 'rpc-error', id, error }
        if (msg.type === 'rpc-result' && msg.id === id) {
          clearTimeout(timeout)
          worker.off('message', handler)
          resolve(msg.result)
        }
        if (msg.type === 'rpc-error' && msg.id === id) {
          clearTimeout(timeout)
          worker.off('message', handler)
          reject(new Error(msg.error))
        }
      }

      worker.on('message', handler)
      worker.postMessage({ type: 'rpc', id, method, args } satisfies MainToWorkerMessage)
    })
  }

  async function stop(): Promise<void> {
    active = false
    // Clean up event subscriptions
    for (const cleanup of eventSubs.values()) {
      try { cleanup() } catch { /* ignore */ }
    }
    eventSubs.clear()
    // Run destroy callbacks
    for (const cb of destroyCallbacks) {
      try { cb() } catch { /* ignore cleanup errors */ }
    }
    destroyCallbacks.length = 0
    await worker.terminate()
  }

  return { start, callMethod, stop }
}

async function executeMethod(
  method: string,
  args: unknown[],
  deps: BridgeDependencies,
  pluginDb: Database.Database,
  eventBus: any,
  pluginId: string,
  worker: Worker,
  destroyCallbacks: (() => void)[],
): Promise<unknown> {
  switch (method) {
    case 'config.getAll':
      return deps.getConfig()
    case 'config.get':
      return deps.getConfigValue(args[0] as string)
    case 'config.set':
      deps.setConfigValue(args[0] as string, args[1])
      return undefined
    case 'db.run':
      return pluginDb.prepare(args[0] as string).run(...(args[1] as any[] || []))
    case 'db.get':
      return pluginDb.prepare(args[0] as string).get(...(args[1] as any[] || [])) || null
    case 'db.all':
      return pluginDb.prepare(args[0] as string).all(...(args[1] as any[] || []))
    case 'events.on': {
      const eventName = args[0] as string
      const subId = `ev_${++subIdCounter}`
      const cleanup = eventBus.on(eventName, (payload: unknown) => {
        if (worker) {
          worker.postMessage({
            type: 'event',
            event: eventName,
            payload,
          } satisfies MainToWorkerMessage)
        }
      }, pluginId)
      eventSubs.set(subId, cleanup)
      return subId
    }
    case 'events.off': {
      const subId = args[0] as string
      const cleanup = eventSubs.get(subId)
      if (cleanup) {
        cleanup()
        eventSubs.delete(subId)
      }
      return undefined
    }
    case 'fetch': {
      const response = await fetch(args[0] as string, args[1] as RequestInit)
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      }
    }
    case 'api.get':
    case 'api.post':
    case 'api.put':
    case 'api.delete': {
      const [path, data] = args
      const httpMethod = method.replace('api.', '').toUpperCase()
      const url = `${deps.apiBaseUrl}${path}`
      const res = await fetch(url, {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deps.authToken}`,
        },
        body: data ? JSON.stringify(data) : undefined,
      })
      if (!res.ok) throw new Error(`API ${httpMethod} ${path} returned ${res.status}`)
      const text = await res.text()
      try { return JSON.parse(text) } catch { return text }
    }
    case 'notifications.send':
      // Notification dispatch handled by main process
      return undefined
    case 'onDestroy':
      // The actual onDestroy pattern: PluginRuntime in main process
      // tracks destroy callbacks from RPC calls (e.g. events.on unsubscribe).
      // Worker cannot pass functions across MessagePort.
      return undefined
    default:
      throw new Error(`Unknown method: ${method}`)
  }
}
