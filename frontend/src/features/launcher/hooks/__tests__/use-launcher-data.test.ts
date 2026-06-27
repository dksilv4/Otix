import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { useGameUIState, useGameShelves } from '../use-launcher-data'

// -- Module mocks — required for import resolution of use-launcher-data --

vi.mock('@/lib/desktop/api', () => ({
  getDesktopAPI: vi.fn(() => null),
  hasDesktopAPI: vi.fn(() => false),
}))

vi.mock('@/features/launcher/game-queries', () => ({
  useLocalGames: vi.fn(() => ({ data: [], isLoading: false })),
  useAcceptSuggestion: vi.fn(() => ({ mutate: vi.fn() })),
  useRejectSuggestion: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/features/launcher/queries', () => ({
  usePopularGames: vi.fn(() => ({ data: [], isLoading: false })),
  useGameDetail: vi.fn(() => ({ data: null, isLoading: false })),
  useGameGenres: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/features/launcher/storage', () => ({
  fetchIsoPaths: vi.fn(() => Promise.resolve([])),
}))

// -- Import after mocks -----------------------------------------------

import { usePopularGames } from '@/features/launcher/queries'
import type { LocalGame, CatalogGame } from '@/features/launcher/types'

// -- Fixtures ---------------------------------------------------------

const mockLocalGames: LocalGame[] = [
  {
    id: 'g1',
    title: 'Unmatched Plain',
    exePath: '/games/unmatched.exe',
    platform: 'pc',
    installDir: '/games/unmatched',
  },
  {
    id: 'g2',
    title: 'Matched One',
    exePath: '/games/matched1.exe',
    platform: 'steam',
    installDir: '/games/matched1',
    data: { id: 'media-2', title: 'Matched One' } as unknown as LocalGame['data'],
  },
  {
    id: 'g3',
    title: 'Matched Two',
    exePath: '/games/matched2.exe',
    platform: 'pc',
    installDir: '/games/matched2',
    data: { id: 'media-3', title: 'Matched Two' } as unknown as LocalGame['data'],
  },
  {
    id: 'g4',
    title: 'Has Suggestion',
    exePath: '/games/suggested.exe',
    platform: 'pc',
    installDir: '/games/suggested',
    matchSuggestion: {
      id: 'sug-4',
      title: 'Suggestion Title',
      platform: 'pc',
      iconUrl: '',
      posterUrl: '',
    } as unknown as LocalGame['matchSuggestion'],
  },
  {
    id: 'g5',
    title: 'Unmatched No Suggestion',
    exePath: '/games/un2.exe',
    platform: 'gog',
    installDir: '/games/un2',
  },
]

const mockPopular: CatalogGame[] = [
  {
    id: 'pop-1',
    mediaType: 'game',
    title: 'Popular 1',
    slug: 'popular-1',
    popularity: 100,
    ratingCount: 50,
    isAdult: false,
  },
]

// -- Tests: useGameUIState --------------------------------------------

describe('useGameUIState', () => {
  it('returns default state values', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    expect(result.current.selectedLocalId).toBeNull()
    expect(result.current.sidePanelOpen).toBe(true)
    expect(result.current.activeTab).toBe('all')
    expect(result.current.localSearchQuery).toBe('')
    expect(result.current.scanning).toBe(false)
  })

  it('selectGame sets selectedLocalId', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.selectGame('g2'))
    expect(result.current.selectedLocalId).toBe('g2')
  })

  it('setActiveTab switches between all, matched, and unmatched', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.setActiveTab('matched'))
    expect(result.current.activeTab).toBe('matched')

    act(() => result.current.setActiveTab('unmatched'))
    expect(result.current.activeTab).toBe('unmatched')

    act(() => result.current.setActiveTab('all'))
    expect(result.current.activeTab).toBe('all')
  })

  it('setLocalSearchQuery updates the search string', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.setLocalSearchQuery('Portal'))
    expect(result.current.localSearchQuery).toBe('Portal')

    act(() => result.current.setLocalSearchQuery(''))
    expect(result.current.localSearchQuery).toBe('')
  })

  it('setSidePanelOpen toggles the side panel', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.setSidePanelOpen(false))
    expect(result.current.sidePanelOpen).toBe(false)
  })

  it('setScanning flags scanning state', () => {
    const { result } = renderHook(() => useGameUIState(), {
      wrapper: createWrapper(),
    })

    act(() => result.current.setScanning(true))
    expect(result.current.scanning).toBe(true)
  })
})

// -- Tests: useGameShelves --------------------------------------------

describe('useGameShelves', () => {
  beforeEach(() => {
    vi.mocked(usePopularGames).mockReturnValue({
      data: mockPopular,
      isLoading: false,
    } as ReturnType<typeof usePopularGames>)
  })

  it('builds all four shelf rows from matched, suggested, unmatched, and popular data', () => {
    const matched = mockLocalGames.filter((g) => g.data?.id)
    const unmatched = mockLocalGames.filter((g) => !g.data?.id)

    const { result } = renderHook(
      () => useGameShelves(matched, unmatched, mockLocalGames),
      { wrapper: createWrapper() },
    )

    const { shelves } = result.current

    const installed = shelves.find((s) => s.id === 'matched')
    expect(installed).toBeDefined()
    expect(installed!.label).toBe('Installed Games')
    expect(installed!.games).toHaveLength(2)

    const suggested = shelves.find((s) => s.id === 'suggested')
    expect(suggested).toBeDefined()
    expect(suggested!.label).toBe('Suggested Matches')
    expect(suggested!.games).toHaveLength(1)

    const unmatchedShelf = shelves.find((s) => s.id === 'unmatched')
    expect(unmatchedShelf).toBeDefined()
    expect(unmatchedShelf!.label).toBe('Unmatched Games')
    expect(unmatchedShelf!.games).toHaveLength(2)

    const popular = shelves.find((s) => s.id === 'popular')
    expect(popular).toBeDefined()
    expect(popular!.label).toBe('Popular on Otix')
    expect(popular!.catalogGames).toHaveLength(1)
  })

  it('returns empty array when no games or popular data', () => {
    vi.mocked(usePopularGames).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof usePopularGames>)

    const { result } = renderHook(
      () => useGameShelves([], [], []),
      { wrapper: createWrapper() },
    )

    expect(result.current.shelves).toEqual([])
  })

  it('omits popular shelf when catalog query is still loading', () => {
    vi.mocked(usePopularGames).mockReturnValue({
      data: [],
      isLoading: true,
    } as ReturnType<typeof usePopularGames>)

    const matched = mockLocalGames.filter((g) => g.data?.id)
    const unmatched = mockLocalGames.filter((g) => !g.data?.id)

    const { result } = renderHook(
      () => useGameShelves(matched, unmatched, mockLocalGames),
      { wrapper: createWrapper() },
    )

    const popularShelf = result.current.shelves.find((s) => s.id === 'popular')
    expect(popularShelf).toBeUndefined()

    expect(result.current.shelves.length).toBeGreaterThan(0)
  })

  it('caps matched shelf at 12 games', () => {
    const manyGames: LocalGame[] = Array.from({ length: 15 }, (_, i) => ({
      id: `many-${i}`,
      title: `Game ${i}`,
      exePath: `/games/g${i}.exe`,
      platform: 'pc' as const,
      installDir: `/games/g${i}`,
      data: { id: `media-${i}`, title: `Game ${i}` } as unknown as LocalGame['data'],
    }))

    const { result } = renderHook(
      () => useGameShelves(manyGames, [], manyGames),
      { wrapper: createWrapper() },
    )

    const matched = result.current.shelves.find((s) => s.id === 'matched')
    expect(matched).toBeDefined()
    expect(matched!.games).toHaveLength(12)
  })
})
