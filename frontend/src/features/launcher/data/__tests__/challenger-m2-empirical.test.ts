import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { LocalGame } from '../../types'
import type { ServerGameFile } from '@/features/downloads/types'
import {
  localGameKeys,
  useLocalGames,
} from '../game-queries'
import * as storageModule from '../storage'
import {
  mergeLocalAndServerGames,
  groupServerFilesByGame,
  LocalGameMatcher,
  groupedUpdateFiles,
  groupedServerGameToLocalGame,
} from '../visible-games'
import { mergeDuplicateGames } from '../storage-utils'
import {
  queuePatchLocalGame,
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

describe('Milestone 2 Challenger Empirical Suite', () => {
  // ── Mission 1: Benchmark mergeLocalAndServerGames ──────────────────
  describe('1. Empirical Benchmark: mergeLocalAndServerGames (500 local, 200 server groups)', () => {
    it('profiles and benchmarks execution latency for 500 local games and 200 server groups', () => {
      // 500 local games
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

      // 200 distinct server game files -> 200 server groups
      const mockFiles: ServerGameFile[] = []
      for (let j = 0; j < 200; j++) {
        const isNew = j >= 100
        const catId = isNew ? `new-cat-${j}` : `cat-${j}`
        const title = isNew ? `New Server Game ${j}` : `Game Title ${j}`
        mockFiles.push(
          createMockServerFile(`server-${j}`, {
            filename: `${title.replace(/\s+/g, '.')}.Release-GROUP.iso`,
            gameTitle: title,
            catalogItem: { id: catId, title, slug: `slug-${j}` },
          }),
        )
      }

      const groups = groupServerFilesByGame(mockFiles)
      expect(groups.length).toBe(200)

      // Warm up
      for (let w = 0; w < 5; w++) {
        mergeLocalAndServerGames(mockGames, mockFiles)
      }

      // Diagnostic profiling of individual phases within mergeLocalAndServerGames
      const t0 = performance.now()
      const filtered = mockGames.map((g) => ({ ...g }))
      const tFiltered = performance.now() - t0

      const t1 = performance.now()
      const deduped = mergeDuplicateGames(filtered)
      const tDedup = performance.now() - t1

      const t2 = performance.now()
      const groupedFiles = groupServerFilesByGame(mockFiles)
      const tGroupFiles = performance.now() - t2

      const t3 = performance.now()
      const matcher = new LocalGameMatcher(deduped)
      const tMatcherBuild = performance.now() - t3

      const t4 = performance.now()
      let matchCount = 0
      for (const group of groupedFiles) {
        if (matcher.findMatch(group)) matchCount++
      }
      const tMatching = performance.now() - t4

      console.log(
        `\n[DIAGNOSTIC PROFILE OF PHASES]:\n` +
        `  Filter & Clone (500 items): ${tFiltered.toFixed(2)}ms\n` +
        `  mergeDuplicateGames (500 items): ${tDedup.toFixed(2)}ms\n` +
        `  groupServerFilesByGame (200 files): ${tGroupFiles.toFixed(2)}ms\n` +
        `  LocalGameMatcher Build (500 items): ${tMatcherBuild.toFixed(2)}ms\n` +
        `  Matcher findMatch (200 groups): ${tMatching.toFixed(2)}ms (matches found: ${matchCount})\n` +
        `  Sum of sub-phases: ${(tFiltered + tDedup + tGroupFiles + tMatcherBuild + tMatching).toFixed(2)}ms`,
      )

      // Measure 30 benchmark runs of the complete mergeLocalAndServerGames
      const iterations = 30
      const times: number[] = []

      for (let run = 0; run < iterations; run++) {
        const start = performance.now()
        const result = mergeLocalAndServerGames(mockGames, mockFiles)
        const elapsed = performance.now() - start
        times.push(elapsed)
        if (run === 0) {
          expect(result.length).toBe(600)
        }
      }

      times.sort((a, b) => a - b)
      const sum = times.reduce((acc, t) => acc + t, 0)
      const mean = sum / iterations
      const median = times[Math.floor(iterations / 2)]
      const min = times[0]
      const max = times[times.length - 1]

      console.log(
        `\n[BENCHMARK] mergeLocalAndServerGames (500 local, 200 server groups):\n` +
        `  Iterations: ${iterations}\n` +
        `  Mean: ${mean.toFixed(2)}ms\n` +
        `  Median: ${median.toFixed(2)}ms\n` +
        `  Min: ${min.toFixed(2)}ms\n` +
        `  Max: ${max.toFixed(2)}ms\n` +
        `  Target SLA: <10.00ms`,
      )

      // Test against the SLA
      expect(median).toBeLessThan(10)
    })
  })

  // ── Mission 2: Stress test query deduplication ─────────────────────
  describe('2. Stress Test: Query Key Deduplication Across Multiple Components', () => {
    let queryClient: QueryClient

    beforeEach(() => {
      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 30_000,
          },
        },
      })
    })

    it('shares a single cached dataset and single IPC fetch when multiple components mount with different sort/filter options', async () => {
      const mockDataset: LocalGame[] = [
        createMockGame('g1', {
          title: 'Cyberpunk 2077',
          platform: 'pc',
          lastPlayedAt: '2026-03-01T12:00:00Z',
          otixMediaId: 'cat-cp',
        }),
        createMockGame('g2', {
          title: 'Zelda Tears of the Kingdom',
          platform: 'switch',
          lastPlayedAt: '2026-01-15T12:00:00Z',
          otixMediaId: 'cat-zelda',
        }),
        createMockGame('g3', {
          title: 'Half-Life 2',
          platform: 'steam',
          lastPlayedAt: '2026-02-20T12:00:00Z',
          otixMediaId: undefined,
          matchSuggestion: { id: 'sugg-hl2', title: 'Half-Life 2' },
        }),
        createMockGame('g4', {
          title: 'Super Mario Odyssey',
          platform: 'switch',
          lastPlayedAt: '2026-01-01T12:00:00Z',
          exePath: undefined,
        }),
      ]

      const fetchGamesSpy = vi.spyOn(storageModule, 'fetchGames').mockResolvedValue(mockDataset)

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      const { result: hook1 } = renderHook(
        () => useLocalGames({ sortBy: 'last_played_at', sortDir: 'desc' }),
        { wrapper },
      )

      const { result: hook2 } = renderHook(
        () => useLocalGames({ sortBy: 'title', sortDir: 'asc' }),
        { wrapper },
      )

      const { result: hook3 } = renderHook(
        () => useLocalGames({ platform: ['switch'] }),
        { wrapper },
      )

      const { result: hook4 } = renderHook(
        () => useLocalGames({ matched: true }),
        { wrapper },
      )

      const { result: hook5 } = renderHook(
        () => useLocalGames(),
        { wrapper },
      )

      await waitFor(() => {
        expect(hook1.current.isSuccess).toBe(true)
        expect(hook2.current.isSuccess).toBe(true)
        expect(hook3.current.isSuccess).toBe(true)
        expect(hook4.current.isSuccess).toBe(true)
        expect(hook5.current.isSuccess).toBe(true)
      })

      expect(fetchGamesSpy).toHaveBeenCalledTimes(1)

      const queries = queryClient.getQueryCache().findAll({ queryKey: ['local-games', 'list'] })
      expect(queries).toHaveLength(1)

      expect(hook1.current.data?.map((g) => g.id)).toEqual(['g1', 'g3', 'g2', 'g4'])
      expect(hook2.current.data?.map((g) => g.id)).toEqual(['g1', 'g3', 'g4', 'g2'])
      expect(hook3.current.data?.map((g) => g.id)).toEqual(['g2', 'g4'])
      expect(hook4.current.data?.map((g) => g.id)).toEqual(['g1', 'g2'])
      expect(hook5.current.data?.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4'])

      fetchGamesSpy.mockRestore()
    })
  })

  // ── Mission 3: Stress test batch hydration ─────────────────────────
  describe('3. Stress Test: Batch Hydration Debounce & Invalidation Throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('suppresses invalidation storms: 50 rapid desktop DB changes trigger invalidateQueries at most ONCE', async () => {
      const queryClient = new QueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      let registeredListener: (() => void) | null = null
      const fakeDesktopApi = {
        onGamesDbChanged: vi.fn((cb: () => void) => {
          registeredListener = cb
          return () => {
            registeredListener = null
          }
        }),
      }

      const originalDesktopAPI = (window as any).desktopAPI
      ;(window as any).desktopAPI = fakeDesktopApi

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)

      const { unmount } = renderHook(() => useLocalGames(), { wrapper })

      expect(fakeDesktopApi.onGamesDbChanged).toHaveBeenCalled()
      expect(registeredListener).not.toBeNull()

      for (let i = 0; i < 50; i++) {
        registeredListener!()
        vi.advanceTimersByTime(5)
      }

      expect(invalidateSpy).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(200)

      expect(invalidateSpy).toHaveBeenCalledTimes(1)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: localGameKeys.all })

      unmount()
      ;(window as any).desktopAPI = originalDesktopAPI
    })

    it('batches 50 rapid queuePatchLocalGame updates into a single query cache setQueriesData', () => {
      const queryClient = new QueryClient()
      const setQueriesDataSpy = vi.spyOn(queryClient, 'setQueriesData')

      const initialGames: LocalGame[] = []
      for (let i = 0; i < 50; i++) {
        initialGames.push(createMockGame(`g-${i}`, { title: `Game ${i}` }))
      }
      queryClient.setQueryData(localGameKeys.list(), initialGames)

      setQueriesDataSpy.mockClear()

      for (let i = 0; i < 50; i++) {
        queuePatchLocalGame(queryClient, {
          ...initialGames[i],
          otixMediaId: `cat-hydrated-${i}`,
          title: `Game ${i} Hydrated`,
        })
      }

      expect(setQueriesDataSpy).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(100)

      expect(setQueriesDataSpy).toHaveBeenCalledTimes(1)

      const cached = queryClient.getQueryData<LocalGame[]>(localGameKeys.list())
      expect(cached).toHaveLength(50)
      for (let i = 0; i < 50; i++) {
        expect(cached?.[i].otixMediaId).toBe(`cat-hydrated-${i}`)
      }
    })
  })
})
