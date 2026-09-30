import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockOpenIndexerSearch: vi.fn(),
  mockGetCachedNodes: vi.fn(),
}))

vi.mock('@/features/downloads/open-indexer-search', () => ({
  openIndexerSearch: (...args: unknown[]) => mocks.mockOpenIndexerSearch(...args),
}))

vi.mock('@/features/downloads/hooks/use-node-downloads', () => ({
  getCachedNodes: () => mocks.mockGetCachedNodes(),
}))

import { createIndexerProvider } from './providers/indexer-provider'

describe('indexer provider', () => {
  beforeEach(() => {
    mocks.mockOpenIndexerSearch.mockReset()
    mocks.mockGetCachedNodes.mockReset()
    mocks.mockGetCachedNodes.mockReturnValue([
      { id: 42, name: 'Home NAS', isActive: true },
    ])
  })

  it('exposes provider metadata', () => {
    const provider = createIndexerProvider()
    expect(provider.id).toBe('indexer')
    expect(provider.label).toBe('Indexers')
    expect(provider.domain).toBe('games')
  })

  it('returns generic search indexers command on empty query', async () => {
    const provider = createIndexerProvider()
    const commands = await provider.search('')
    expect(commands).toHaveLength(1)
    expect(commands[0].id).toBe('indexer:open')
    expect(commands[0].title).toBe('Search indexers')
    expect(commands[0].subtitle).toBe('Search Prowlarr on Home NAS for releases')

    commands[0].run()
    expect(mocks.mockOpenIndexerSearch).toHaveBeenCalledWith({
      nodeId: 42,
      nodeName: 'Home NAS',
    })
  })

  it('returns generic and targeted commands when querying indexer keyword', async () => {
    const provider = createIndexerProvider()
    const commands = await provider.search('indexer')
    const ids = commands.map((c) => c.id)
    expect(ids).toContain('indexer:open')
    expect(ids).toContain('indexer:search:indexer')
  })

  it('returns targeted indexer search command for games like Little Nightmares 3', async () => {
    const provider = createIndexerProvider()
    const commands = await provider.search('Little Nightmares 3')
    expect(commands).toHaveLength(1)
    expect(commands[0].id).toBe('indexer:search:little nightmares 3')
    expect(commands[0].title).toBe('Search indexers for “Little Nightmares 3”')
    expect(commands[0].subtitle).toBe('Search Prowlarr on Home NAS for releases')

    commands[0].run()
    expect(mocks.mockOpenIndexerSearch).toHaveBeenCalledWith({
      query: 'Little Nightmares 3',
      nodeId: 42,
      nodeName: 'Home NAS',
    })
  })

  it('falls back gracefully when no cached nodes exist', async () => {
    mocks.mockGetCachedNodes.mockReturnValue([])
    const provider = createIndexerProvider()
    const commands = await provider.search('Hades II')
    expect(commands[0].subtitle).toBe('Search Prowlarr indexers for releases')

    commands[0].run()
    expect(mocks.mockOpenIndexerSearch).toHaveBeenCalledWith({
      query: 'Hades II',
      nodeId: undefined,
      nodeName: undefined,
    })
  })
})
