import { describe, expect, it, vi } from 'vitest'
import {
  nodeUrlKey,
  pendingNodesToClaim,
  pendingNodesToRefresh,
  probeLocalGameNode,
} from '../pending-nodes'

describe('pendingNodesToClaim', () => {
  it('returns nodes that are not already connected', () => {
    const claim = pendingNodesToClaim(
      [
        { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
        { serverName: 'Office NAS', localUrl: 'http://192.168.1.50:8090', authToken: 'tok2' },
      ],
      [{ primaryUrl: 'http://127.0.0.1:8090', localUrl: 'http://127.0.0.1:8090' }],
    )
    expect(claim).toEqual([
      { serverName: 'Office NAS', localUrl: 'http://192.168.1.50:8090', authToken: 'tok2' },
    ])
  })

  it('treats localhost and 127.0.0.1 as the same node', () => {
    expect(
      pendingNodesToClaim(
        [{ serverName: 'DK Game Storage Server', localUrl: 'http://localhost:8090', authToken: 'tok' }],
        [{ primaryUrl: 'http://127.0.0.1:8090' }],
      ),
    ).toEqual([])
  })

  it('returns nothing when every pending node is already linked', () => {
    expect(
      pendingNodesToClaim(
        [{ serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
        [{ primaryUrl: 'http://127.0.0.1:8090' }],
      ),
    ).toEqual([])
  })
})

describe('pendingNodesToRefresh', () => {
  it('updates a saved server that is missing the heartbeat token', () => {
    expect(
      pendingNodesToRefresh(
        [{ serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
        [{ id: 7, primaryUrl: 'http://127.0.0.1:8090', authToken: '' }],
      ),
    ).toEqual([
      {
        id: 7,
        node: { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
      },
    ])
  })

  it('skips servers that already have the same token', () => {
    expect(
      pendingNodesToRefresh(
        [{ serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
        [{ id: 7, primaryUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
      ),
    ).toEqual([])
  })
})

describe('nodeUrlKey', () => {
  it('normalizes localhost', () => {
    expect(nodeUrlKey('http://localhost:8090')).toBe('127.0.0.1:8090')
  })
})

describe('probeLocalGameNode', () => {
  it('reads the node name and dashboard token', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes('/api/v1/status')) {
        return {
          ok: true,
          json: async () => ({ server_name: 'DK Game Storage Server' }),
        }
      }
      return {
        ok: true,
        text: async () => '<input id="node-access-token" readonly value="otix_secret_token_abc123" />',
      }
    })
    await expect(probeLocalGameNode(fetcher as unknown as typeof fetch)).resolves.toEqual({
      serverName: 'DK Game Storage Server',
      localUrl: 'http://127.0.0.1:8090',
      authToken: 'otix_secret_token_abc123',
    })
  })

  it('returns null when nothing is listening', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(probeLocalGameNode(fetcher as unknown as typeof fetch)).resolves.toBeNull()
  })
})
