import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_API_BASE_URL } from './client'
import { connectTaskSseStream } from './sse-client'

function plexSyncResponses() {
  const create = new Response(JSON.stringify({ task_id: '42' }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  })
  const sse = 'data: {"type":"sync_complete","total":3,"matched":2,"seeded":1}\n\n'
  const stream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
  return [create, stream] as const
}

describe('connectTaskSseStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts Plex sync to the same origin as apiClient, not localhost or production', async () => {
    const urls: string[] = []
    const [create, stream] = plexSyncResponses()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input))
        return urls.length === 1 ? create : stream
      }),
    )

    const terminal = await connectTaskSseStream({
      createEndpoint: '/integrations/plex/sync',
      streamEndpoint: (taskId) => `/integrations/plex/sync/${taskId}/stream`,
      terminalEvents: ['sync_complete', 'error'],
      token: 'access-token',
    })

    expect(urls[0]).toBe(`${CLIENT_API_BASE_URL}/integrations/plex/sync`)
    expect(urls[1]).toBe(`${CLIENT_API_BASE_URL}/integrations/plex/sync/42/stream`)
    expect(urls.join(' ')).not.toMatch(/localhost:8000/)
    expect(urls.join(' ')).not.toMatch(/otix\.app/)
    expect(terminal).toMatchObject({ type: 'sync_complete', total: 3 })
  })
})
