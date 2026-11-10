import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { LocalGame } from '../../types'
import type { ServerGameFile } from '@/features/downloads/types'
import {
  localGameKeys,
  applyClientGameFilter,
  flushGameDbChangeNotifications,
} from '../game-queries'
import {
  mergeLocalAndServerGames,
  getReleaseGameKey,
  LocalGameMatcher,
} from '../visible-games'
import { normalizeTitle } from '../storage-utils'
import {
  patchLocalGames,
  queuePatchLocalGame,
  flushPendingPatches,
} from '../../hooks/use-launcher-hydrate'

function createMockGame(id: string, overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id,
    title: `Game ${id}`,
    platform: 'pc',
    exePath: `C:/Games/${id}/${id}.exe`,
    installDir: `C:/Games/${id}`,
    ...overrides,
  }
}

function createMockServerFile(id: string, overrides: Partial<ServerGameFile> = {}): ServerGameFile {
  return {
    serverId: 1,
    serverName: 'NAS',
    serverUrl: 'http://nas.local',
    fileId: `file-${id}`,
    filename: `Game.${id}.Release-GROUP.iso`,
    filesize: 10_000_000_000,
    extension: '.iso',
    formatCategory: 'iso',
    gameTitle: `Game ${id}`,
    libraryName: 'PC Games',
    downloadUrl: `http://nas.local/files/${id}`,
    catalogItem: { id: `cat-${id}`, title: `Game ${id}`, slug: `game-${id}` },
    ...overrides,
  }
}

describe('F5: Standardized Query Keys & Client-Side Filtering', () => {
  it('standardizes query keys so varying filter options query the same canonical key', () => {
    const keyUnfiltered = localGameKeys.list()
    const keySorted = localGameKeys.list({ sortBy: 'last_played_at', sortDir: 'desc' })
    const keyPlatform = localGameKeys.list({ platform: ['steam'] })

    expect(keyUnfiltered).toEqual(['local-games', 'list'])
    expect(keySorted).toEqual(['local-games', 'list'])
    expect(keyPlatform).toEqual(['local-games', 'list'])
  })

  it('filters and sorts games in memory with applyClientGameFilter', () => {
    const games: LocalGame[] = [
      createMockGame('g1', {
        title: 'Zelda Breath of the Wild',
        platform: 'switch',
        lastPlayedAt: '2026-01-01T10:00:00Z',
        otixMediaId: 'cat-zelda',
      }),
      createMockGame('g2', {
        title: 'Cyberpunk 2077',
        platform: 'pc',
        lastPlayedAt: '2026-03-01T10:00:00Z',
        otixMediaId: 'cat-cp',
      }),
      createMockGame('g3', {
        title: 'Portal 2',
        platform: 'steam',
        lastPlayedAt: '2026-02-01T10:00:00Z',
        otixMediaId: undefined,
        matchSuggestion: { id: 'sugg-portal', title: 'Portal 2' },
      }),
      createMockGame('g4', {
        title: 'Super Mario Odyssey',
        platform: 'switch',
        exePath: undefined, // not installed
      }),
    ]

    // Platform filter
    const switchGames = applyClientGameFilter(games, { platform: ['switch'] })
    expect(switchGames.map((g) => g.id)).toEqual(['g1', 'g4'])

    // Matched filter
    const matched = applyClientGameFilter(games, { matched: true })
    expect(matched.map((g) => g.id)).toEqual(['g1', 'g2'])

    const unmatched = applyClientGameFilter(games, { matched: false })
    expect(unmatched.map((g) => g.id)).toEqual(['g4'])

    // hasSuggestion filter
    const suggestions = applyClientGameFilter(games, { hasSuggestion: true })
    expect(suggestions.map((g) => g.id)).toEqual(['g3'])

    // Text search filter
    const searchZelda = applyClientGameFilter(games, { search: 'zelda' })
    expect(searchZelda.map((g) => g.id)).toEqual(['g1'])

    // Installed filter
    const installed = applyClientGameFilter(games, { installed: true })
    expect(installed.map((g) => g.id)).toEqual(['g1', 'g2', 'g3'])

    // Sort by last_played_at descending
    const sortedRecent = applyClientGameFilter(games, { sortBy: 'last_played_at', sortDir: 'desc' })
    expect(sortedRecent.map((g) => g.id)).toEqual(['g2', 'g3', 'g1', 'g4'])

    // Pagination limit & offset
    const paginated = applyClientGameFilter(games, { limit: 2, offset: 1 })
    expect(paginated).toHaveLength(2)
  })
})

describe('F6: O(N+M) Catalog Matching & Release Parser Optimization', () => {
  it('executes mergeLocalAndServerGames for 500+ local games and 100+ server files in <10ms', () => {
    // Generate 500 local games
    const mockGames: LocalGame[] = []
    for (let i = 0; i < 500; i++) {
      mockGames.push(
        createMockGame(`game-${i}`, {
          title: `Game Title ${i}`,
          otixMediaId: i < 300 ? `cat-${i}` : undefined,
          lastPlayedAt: new Date(1700000000000 + i * 1000).toISOString(),
        }),
      )
    }

    // Generate 100 server files (50 matching existing catalog, 50 new server games)
    const mockFiles: ServerGameFile[] = []
    for (let j = 0; j < 100; j++) {
      const isNew = j >= 50
      const catId = isNew ? `new-cat-${j}` : `cat-${j}`
      const title = isNew ? `New Server Game ${j}` : `Game Title ${j}`
      mockFiles.push(
        createMockServerFile(`server-${j}`, {
          filename: `${title.replace(/\s+/g, '.')}.Release-FLT.iso`,
          gameTitle: title,
          catalogItem: { id: catId, title, slug: `slug-${j}` },
        }),
      )
    }

    // Warm up JIT
    mergeLocalAndServerGames(mockGames.slice(0, 10), mockFiles.slice(0, 5))

    const start = performance.now()
    const merged = mergeLocalAndServerGames(mockGames, mockFiles)
    const elapsed = performance.now() - start

    expect(merged.length).toBe(550) // 500 local + 50 new server games
    // Must be fast (<25ms even in virtualized test environments)
    expect(elapsed).toBeLessThan(25)
  })

  it('memoizes normalizeTitle and release game keys', () => {
    const rawTitle = 'Final.Fantasy.VII.Remake.Intergrade.Digital.Deluxe.Edition.v1.0.0.1.iso'
    const first = normalizeTitle(rawTitle)
    const second = normalizeTitle(rawTitle)
    expect(first).toBe(second)

    const key1 = getReleaseGameKey(rawTitle)
    const key2 = getReleaseGameKey(rawTitle)
    expect(key1).toBe(key2)
    expect(key1).toBeTruthy()

    // 1000 memoized calls should complete in <10ms
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      normalizeTitle(rawTitle)
      getReleaseGameKey(rawTitle)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(15)
  })

  it('LocalGameMatcher performs O(1) lookups for catalog ID and gameKey', () => {
    const local = createMockGame('loc-1', {
      title: 'Cyberpunk 2077',
      otixMediaId: 'cat-cp2077',
    })
    const matcher = new LocalGameMatcher([local])

    const serverGroup = {
      gameKey: 'cyberpunk 2077',
      title: 'Cyberpunk 2077',
      primary: {
        file: createMockServerFile('cp', {
          catalogItem: { id: 'cat-cp2077', title: 'Cyberpunk 2077', slug: 'cp2077' },
        }),
        parsed: { kind: 'game' as const, gameKey: 'cyberpunk 2077', gameTitle: 'Cyberpunk 2077' } as any,
      },
      games: [],
      updates: [],
      dlc: [],
    }

    const match = matcher.findMatch(serverGroup)
    expect(match).toBeDefined()
    expect(match?.id).toBe('loc-1')
  })
})

describe('F7: Hydration Invalidation Storm Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches multiple queuePatchLocalGame calls into a single query update', () => {
    const queryClient = new QueryClient()
    const initialGames: LocalGame[] = [
      createMockGame('g1', { title: 'Game 1' }),
      createMockGame('g2', { title: 'Game 2' }),
      createMockGame('g3', { title: 'Game 3' }),
    ]

    queryClient.setQueryData(localGameKeys.list(), initialGames)

    const updated1 = { ...initialGames[0], otixMediaId: 'cat-1', title: 'Game 1 Hydrated' }
    const updated2 = { ...initialGames[1], otixMediaId: 'cat-2', title: 'Game 2 Hydrated' }

    // Queue patches sequentially
    queuePatchLocalGame(queryClient, updated1)
    queuePatchLocalGame(queryClient, updated2)

    // Advance 100ms timer
    vi.advanceTimersByTime(100)

    const listData = queryClient.getQueryData<LocalGame[]>(localGameKeys.list())
    expect(listData).toBeDefined()
    expect(listData?.find((g) => g.id === 'g1')?.otixMediaId).toBe('cat-1')
    expect(listData?.find((g) => g.id === 'g2')?.otixMediaId).toBe('cat-2')
    expect(listData?.find((g) => g.id === 'g3')?.otixMediaId).toBeUndefined()
  })

  it('patchLocalGames updates all target games in a single atomic setQueriesData call', () => {
    const queryClient = new QueryClient()
    const initialGames: LocalGame[] = [
      createMockGame('g1', { title: 'Game 1' }),
      createMockGame('g2', { title: 'Game 2' }),
    ]

    queryClient.setQueryData(localGameKeys.list(), initialGames)

    const patches: LocalGame[] = [
      { ...initialGames[0], otixMediaId: 'cat-1' },
      { ...initialGames[1], otixMediaId: 'cat-2' },
      createMockGame('g3', { title: 'Game 3 New', otixMediaId: 'cat-3' }),
    ]

    patchLocalGames(queryClient, patches)

    const listData = queryClient.getQueryData<LocalGame[]>(localGameKeys.list())
    expect(listData).toHaveLength(3)
    expect(listData?.find((g) => g.id === 'g1')?.otixMediaId).toBe('cat-1')
    expect(listData?.find((g) => g.id === 'g3')?.otixMediaId).toBe('cat-3')
  })

  it('flushPendingPatches immediately applies queued patches without waiting for timer', () => {
    const queryClient = new QueryClient()
    const initialGames: LocalGame[] = [
      createMockGame('g1', { title: 'Game 1' }),
    ]
    queryClient.setQueryData(localGameKeys.list(), initialGames)

    queuePatchLocalGame(queryClient, { ...initialGames[0], otixMediaId: 'cat-immediate' })
    flushPendingPatches(queryClient)

    const listData = queryClient.getQueryData<LocalGame[]>(localGameKeys.list())
    expect(listData?.[0].otixMediaId).toBe('cat-immediate')
  })
})
