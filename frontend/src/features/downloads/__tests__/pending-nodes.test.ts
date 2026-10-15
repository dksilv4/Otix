import { describe, expect, it, vi } from 'vitest'
import {
  isNodeOrphaned,
  nodeUrlKey,
  pendingNodesToClaim,
  pendingNodesToRefresh,
  probeLocalGameNode,
  unclaimLocalGameNode,
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

  it('claims a heartbeat and local probe of the same node only once', () => {
    expect(
      pendingNodesToClaim(
        [
          { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
          { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
        ],
        [],
      ),
    ).toEqual([
      { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
    ])
  })

  it('treats the same access token as the same node even when URLs differ', () => {
    expect(
      pendingNodesToClaim(
        [
          { serverName: 'DK Game Storage Server', localUrl: 'http://192.168.1.50:8090', authToken: 'tok' },
          { serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
        ],
        [],
      ),
    ).toEqual([
      { serverName: 'DK Game Storage Server', localUrl: 'http://192.168.1.50:8090', authToken: 'tok' },
    ])
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

  it('skips servers that already have the same token and name', () => {
    expect(
      pendingNodesToRefresh(
        [{ serverName: 'DK Game Storage Server', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
        [{ id: 7, name: 'DK Game Storage Server', primaryUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
      ),
    ).toEqual([])
  })

  it('updates a saved server when node was renamed in node settings', () => {
    expect(
      pendingNodesToRefresh(
        [{ serverName: 'GAMING PC', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
        [{ id: 7, name: 'Node ID:1', primaryUrl: 'http://127.0.0.1:8090', authToken: 'tok' }],
      ),
    ).toEqual([
      {
        id: 7,
        node: { serverName: 'GAMING PC', localUrl: 'http://127.0.0.1:8090', authToken: 'tok' },
      },
    ])
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
      claimCode: '',
      claimed: false,
    })
  })

  it('returns null when nothing is listening', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(probeLocalGameNode(fetcher as unknown as typeof fetch)).resolves.toBeNull()
  })
})

describe('isNodeOrphaned', () => {
  it('returns false if node is not claimed', () => {
    expect(
      isNodeOrphaned(
        { serverName: 'Node', localUrl: 'http://127.0.0.1:8090', claimed: false },
        [],
      ),
    ).toBe(false)
  })

  it('returns true if node is claimed but not in user servers', () => {
    expect(
      isNodeOrphaned(
        { serverName: 'Node', localUrl: 'http://127.0.0.1:8090', claimed: true, authToken: 'old_tok' },
        [{ primaryUrl: 'http://192.168.1.100:8090', authToken: 'other_tok' }],
      ),
    ).toBe(true)
  })

  it('returns false if node matches a user server by URL or token', () => {
    expect(
      isNodeOrphaned(
        { serverName: 'Node', localUrl: 'http://127.0.0.1:8090', claimed: true, authToken: 'my_tok' },
        [{ primaryUrl: 'http://127.0.0.1:8090', authToken: 'my_tok' }],
      ),
    ).toBe(false)
  })
})

describe('unclaimLocalGameNode', () => {
  it('calls POST /api/v1/claim/unclaim on local node', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }))
    const res = await unclaimLocalGameNode(fetcher as unknown as typeof fetch)
    expect(res).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8090/api/v1/claim/unclaim', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('passes authToken in url query and header when provided', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }))
    const res = await unclaimLocalGameNode(fetcher as unknown as typeof fetch, 'my_secret_token')
    expect(res).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8090/api/v1/claim/unclaim?token=my_secret_token', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer my_secret_token' },
    }))
  })

  it('extracts token from home page if not provided', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === 'http://127.0.0.1:8090/') {
        return {
          ok: true,
          text: async () => '<script>const TOKEN = "extracted_token_123";</script>',
        }
      }
      return { ok: true }
    })
    const res = await unclaimLocalGameNode(fetcher as unknown as typeof fetch)
    expect(res).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8090/api/v1/claim/unclaim?token=extracted_token_123', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer extracted_token_123' },
    }))
  })

  it('returns false on network error', async () => {
    const fetcher = vi.fn(async () => { throw new Error('Network error') })
    const res = await unclaimLocalGameNode(fetcher as unknown as typeof fetch)
    expect(res).toBe(false)
  })
})
