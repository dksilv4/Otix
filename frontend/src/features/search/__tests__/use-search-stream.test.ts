import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { convertKeysToCamelCase } from '@/lib/api/client'

/**
 * Specification and contract tests for the two-stage SSE streaming search client.
 *
 * Requirements (PROJECT.md § Interface Contracts, ORIGINAL_REQUEST.md § R1 & R4):
 * - Endpoint: GET /api/v1/search/stream?q={query}&media_type={type}&limit={limit}
 * - Events:
 *   - event: local -> data: JSON array of MediaItemSummary
 *   - event: external -> data: JSON array of ingested MediaItemSummary
 *   - event: done -> data: { status: 'complete', total_local: number, total_external: number }
 * - Debouncing & Cancellation: Immediate abort of in-flight stream via AbortController on keystroke.
 * - Deep camelCase conversion of snake_case API payload fields.
 */

interface SearchSseEvent<T = unknown> {
  event: 'local' | 'external' | 'done' | string
  data: T
}

class SearchStreamConsumer {
  private abortController: AbortController | null = null

  async consumeStream(
    url: string,
    onEvent: (evt: SearchSseEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Failed to establish SSE stream: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = 'message'

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            currentEvent = 'message'
            continue
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim()
          } else if (trimmed.startsWith('data:')) {
            const rawData = trimmed.slice(5).trim()
            try {
              const parsed = JSON.parse(rawData)
              const converted = convertKeysToCamelCase(parsed)
              onEvent({ event: currentEvent, data: converted })
            } catch {
              // Ignore invalid frames
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return // Clean abort
      }
      throw err
    }
  }

  searchWithCancellation(
    query: string,
    onEvent: (evt: SearchSseEvent) => void
  ): AbortController {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    const url = `/api/v1/search/stream?q=${encodeURIComponent(query)}`

    void this.consumeStream(url, onEvent, signal)
    return this.abortController
  }
}

describe('SearchStreamConsumer Contract & Event Parsing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles event: local and converts snake_case to camelCase', async () => {
    const ssePayload =
      'event: local\n' +
      'data: [{"id":10,"media_type":"movie","title":"Inception","poster_url":"https://img.test/p.jpg","avg_rating":8.8,"release_date":"2010-07-16"}]\n\n'

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )

    const consumer = new SearchStreamConsumer()
    const events: SearchSseEvent[] = []

    await consumer.consumeStream('/api/v1/search/stream?q=Inception', (evt) => {
      events.push(evt)
    })

    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('local')
    const item = (events[0].data as Array<Record<string, unknown>>)[0]
    expect(item.id).toBe(10)
    expect(item.mediaType).toBe('movie')
    expect(item.title).toBe('Inception')
    expect(item.posterUrl).toBe('https://img.test/p.jpg')
    expect(item.avgRating).toBe(8.8)
    expect(item.releaseDate).toBe('2010-07-16')
  })

  it('handles multi-stage events (local -> external -> done)', async () => {
    const ssePayload =
      'event: local\n' +
      'data: [{"id":1,"media_type":"movie","title":"Local Movie"}]\n\n' +
      'event: external\n' +
      'data: [{"id":2,"media_type":"movie","title":"Discovered Movie"}]\n\n' +
      'event: done\n' +
      'data: {"status":"complete","total_local":1,"total_external":1}\n\n'

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )

    const consumer = new SearchStreamConsumer()
    const events: SearchSseEvent[] = []

    await consumer.consumeStream('/api/v1/search/stream?q=test', (evt) => {
      events.push(evt)
    })

    expect(events).toHaveLength(3)
    expect(events[0].event).toBe('local')
    expect(events[1].event).toBe('external')
    expect(events[2].event).toBe('done')
    expect(events[2].data).toEqual({
      status: 'complete',
      totalLocal: 1,
      totalExternal: 1,
    })
  })

  it('aborts prior in-flight request when user continues typing', async () => {
    let abortedFirstRequest = false

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal
        if (signal) {
          signal.addEventListener('abort', () => {
            abortedFirstRequest = true
          })
        }
        return new Promise(() => {}) // Hang indefinitely to simulate slow in-flight stream
      })
    )

    const consumer = new SearchStreamConsumer()

    // First keystroke: "spid"
    consumer.searchWithCancellation('spid', () => {})
    expect(abortedFirstRequest).toBe(false)

    // Second keystroke: "spiderman" immediately follows
    consumer.searchWithCancellation('spiderman', () => {})

    // First request must have been aborted
    expect(abortedFirstRequest).toBe(true)
  })

  it('tolerates fragmented chunks split at arbitrary byte boundaries', async () => {
    const chunk1 = 'event: loc'
    const chunk2 = 'al\ndata: [{"id":42,"media_type":"game","title":"Portal"}]\n\n'

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk1))
        controller.enqueue(new TextEncoder().encode(chunk2))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )

    const consumer = new SearchStreamConsumer()
    const events: SearchSseEvent[] = []

    await consumer.consumeStream('/api/v1/search/stream?q=portal', (evt) => {
      events.push(evt)
    })

    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('local')
    const item = (events[0].data as Array<Record<string, unknown>>)[0]
    expect(item.id).toBe(42)
    expect(item.mediaType).toBe('game')
    expect(item.title).toBe('Portal')
  })

  it('handles stream error gracefully without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500, statusText: 'Internal Server Error' }))
    )

    const consumer = new SearchStreamConsumer()
    await expect(
      consumer.consumeStream('/api/v1/search/stream?q=error', () => {})
    ).rejects.toThrow('Failed to establish SSE stream: 500')
  })
})
