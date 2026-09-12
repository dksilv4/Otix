// desktop/fetch/net.ts
// Real Node transports for the proxy-fetch worker: a one-shot request/response
// transport over the runtime's global fetch (http + https) and an SSE opener
// over http/https.request that parses the incremental text/event-stream into
// complete data frames. Kept separate from worker.ts so tests inject fakes and
// never touch the network.

import http from 'http'
import https from 'https'
import type { RequestOptions } from 'http'
import { IncrementalSseParser } from './sse'
import type { HttpTransport, SseStream } from './types'

/** One-shot request/response over global fetch (undici), http + https. */
export const nodeFetchTransport: HttpTransport = async (opts) => {
  const res = await fetch(opts.url, {
    method: opts.method,
    headers: opts.headers ?? {},
    body: opts.method === 'GET' ? undefined : (opts.body ?? undefined),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  })
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: await res.text(),
  }
}

/** Open a persistent SSE GET and emit complete `data:` payload strings. */
export function openNodeSseStream(url: string, headers: Record<string, string>): SseStream {
  const target = new URL(url)
  const mod = target.protocol === 'https:' ? https : http
  const parser = new IncrementalSseParser()

  let closed = false
  const frameListeners = new Set<(payload: string) => void>()
  const closeListeners = new Set<(error?: Error) => void>()

  const reqOptions: RequestOptions = {
    method: 'GET',
    headers: { Accept: 'text/event-stream', ...headers },
  }

  const req = mod.request(target, reqOptions, (res) => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      for (const message of parser.push(chunk)) {
        if (!closed && message.data !== undefined) {
          for (const listener of frameListeners) listener(message.data)
        }
      }
    })
    res.on('end', () => notifyClose(undefined))
    res.on('error', (err) => notifyClose(err))
  })
  req.on('error', (err) => notifyClose(err))
  req.end()

  function notifyClose(error?: Error): void {
    if (closed) return
    closed = true
    for (const listener of closeListeners) listener(error)
    closeListeners.clear()
    frameListeners.clear()
  }

  return {
    onFrame(listener) {
      frameListeners.add(listener)
    },
    onClose(listener) {
      closeListeners.add(listener)
    },
    close() {
      req.destroy()
      notifyClose(undefined)
    },
  }
}
