/**
 * Reusable SSE client for the Otix SSE platform.
 *
 * Two stream types mirror the backend's `SseStreamConfig`:
 *
 * **Persistent** — stays open until disconnect (e.g. notifications).
 *   Use `createSseStream()` directly or the `useSseStream()` hook.
 *
 * **Task** — POST to create a background job, then connect its event stream
 *   until a terminal event arrives (e.g. sync/rehydrate).
 *   Use `connectTaskSseStream()`.
 *
 * Every connection uses `Authorization: Bearer <token>` so SSE works behind
 * the same auth middleware used by REST endpoints.
 */

import { API_BASE_URL } from './api-client'

// ── Types ──────────────────────────────────────────────────────────

export interface SseEvent {
  type: string
  [key: string]: unknown
}

export interface SseStreamOptions {
  url: string
  token: string
  signal?: AbortSignal
}

export interface TaskStreamConfig {
  /** Endpoint that creates the background task (POST). */
  createEndpoint: string
  /**
   * Endpoint for the SSE event stream. Can be a template string or a
   * function that receives the task ID returned by the create call.
   */
  streamEndpoint: string | ((taskId: string) => string)
  /** Event types that cause the stream to close (e.g. "sync_complete", "error"). */
  terminalEvents: string[]
  token: string
  signal?: AbortSignal
  baseUrl?: string
}

// ── Helpers ─────────────────────────────────────────────────────────

function convertToCamelCase(events: Record<string, unknown>): Record<string, unknown> {
  const toCamel = (s: string): string =>
    s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

  return Object.fromEntries(
    Object.entries(events).map(([k, v]) => [toCamel(k), v]),
  )
}

function convertSseEvent(event: Record<string, unknown>): SseEvent {
  return convertToCamelCase(event) as SseEvent
}

// ── Low-level SSE stream ───────────────────────────────────────────

/**
 * Connect to an SSE endpoint and yield parsed events as an async generator.
 *
 * Usage — persistent stream:
 * ```ts
 * const stream = createSseStream({ url, token })
 * for await (const event of stream) {
 *   console.log(event.type, event)
 * }
 * ```
 */
export async function* createSseStream(
  options: SseStreamOptions,
): AsyncGenerator<SseEvent> {
  const { url, token, signal } = options

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `SSE connection failed: ${response.status} ${response.statusText}`,
    )
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (!payload) continue // keepalive
          try {
            const parsed = JSON.parse(payload) as SseEvent
            yield convertSseEvent(parsed)
          } catch {
            // Malformed frame — skip silently
            continue
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Task stream helper ─────────────────────────────────────────────

/**
 * High-level helper for **task** SSE streams.
 *
 * 1. POSTs to `createEndpoint` to start a background task.
 * 2. Connects to the SSE event stream for that task.
 * 3. Calls `onEvent` for every event (optional).
 * 4. Resolves when a terminal event arrives, returning that event so
 *    callers can extract result data (e.g. matched/total/seeded counts).
 *
 * Usage — sync stream:
 * ```ts
 * const result = await connectTaskSseStream({
 *   createEndpoint: '/integrations/plex/sync',
 *   streamEndpoint: (taskId) => `/integrations/plex/sync/${taskId}/stream`,
 *   terminalEvents: ['sync_complete', 'error'],
 *   token,
 * }, (event) => {
 *   setProgress(event)
 * })
 * ```
 */
export async function connectTaskSseStream(
  config: TaskStreamConfig,
  onEvent?: (event: SseEvent) => void,
): Promise<SseEvent> {
  const baseUrl = API_BASE_URL
  const { token, signal } = config

  // ── 1. Create the background task ──────────────────────────────

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const createResponse = await fetch(`${baseUrl}${config.createEndpoint}`, {
    method: 'POST',
    headers,
    body: '{}',
    signal,
  })

  if (!createResponse.ok) {
    const body = await createResponse.text().catch(() => '')
    throw new Error(
      `Task creation failed (${createResponse.status}): ${body || createResponse.statusText}`,
    )
  }

  const body = await createResponse.json() as Record<string, unknown>

  // Normalise snake_case → camelCase (raw fetch() doesn't auto-convert
  // like apiClient does).
  const taskId = (body.taskId as string | undefined)
    ?? (convertToCamelCase(body).taskId as string | undefined)

  if (!taskId) {
    throw new Error('Task creation response is missing taskId')
  }

  // ── 2. Connect to the event stream ─────────────────────────────

  const streamUrl =
    typeof config.streamEndpoint === 'function'
      ? `${baseUrl}${config.streamEndpoint(taskId)}`
      : `${baseUrl}${config.streamEndpoint}`

  const stream = createSseStream({ url: streamUrl, token, signal })

  // ── 3. Yield events until terminal ─────────────────────────────

  let lastEvent: SseEvent = { type: 'unknown' }

  for await (const event of stream) {
    onEvent?.(event)
    lastEvent = event
    if (config.terminalEvents.includes(event.type)) {
      return event
    }
  }

  // Stream ended without terminal event — task may have already completed
  return lastEvent
}
