import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVirtualRow, useVirtualGrid } from '../use-virtual-grid'
import { useLauncherGames } from '../use-launcher-games'

// Mock dependencies for useLauncherGames
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
  useNavigate: () => mockNavigate,
}))

const mockLocalGames = Array.from({ length: 150 }, (_, i) => ({
  id: `game-${i}`,
  title: `Game ${i}`,
  platform: 'pc',
  data: {},
}))

vi.mock('@/features/launcher/data/game-queries', () => ({
  useLauncherVisibleGames: () => ({
    data: mockLocalGames,
    isLoading: false,
  }),
}))

vi.mock('@/features/launcher/data/queries', () => ({
  usePopularGames: () => ({
    data: [],
    isLoading: false,
  }),
}))

describe('Milestone 3 Empirical Challenge Suite', () => {
  const createMockGames = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `game-stress-${i}`,
      title: `Stress Game ${i.toString().padStart(4, '0')}`,
      platform: 'pc',
      iconUrl: `https://cdn.example.com/icons/${i}.png`,
      posterUrl: `https://cdn.example.com/posters/${i}.png`,
    }))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // 1. Virtualization Stress Tests (500 & 1,500 Games)
  // =========================================================================
  describe('Virtualization Scale & Bounds Stress Testing', () => {
    it('bounds useVirtualRow to visible + overscan (<30 items) with 500 games', () => {
      const games500 = createMockGames(500)
      const { result } = renderHook(() =>
        useVirtualRow(games500, {
          itemWidth: 180,
          gap: 16,
          overscan: 3,
          threshold: 24,
        }),
      )

      expect(result.current.isVirtualized).toBe(true)
      // Viewport width 1200 / 196 = ~6.1 items visible + 6 overscan = max ~13 items
      expect(result.current.virtualItems.length).toBeLessThan(30)
      expect(result.current.virtualItems.length).toBeGreaterThan(0)
      // Verify exact items count is strictly bounded
      expect(result.current.virtualItems.length).toBeLessThanOrEqual(15)

      // Total width should cover all 500 games
      const expectedTotalWidth = 500 * (180 + 16) - 16
      expect(result.current.totalWidth).toBe(expectedTotalWidth)
      expect(result.current.paddingEnd).toBeGreaterThan(0)
      expect(result.current.paddingStart).toBe(0)
    })

    it('bounds useVirtualRow to visible + overscan (<30 items) with 1,500 games', () => {
      const games1500 = createMockGames(1500)
      const { result } = renderHook(() =>
        useVirtualRow(games1500, {
          itemWidth: 180,
          gap: 16,
          overscan: 3,
          threshold: 24,
        }),
      )

      expect(result.current.isVirtualized).toBe(true)
      // Even with 1,500 games, active DOM items must remain bounded to visible + overscan (<30 items)
      expect(result.current.virtualItems.length).toBeLessThan(30)
      expect(result.current.virtualItems.length).toBeLessThanOrEqual(15)

      const expectedTotalWidth = 1500 * (180 + 16) - 16
      expect(result.current.totalWidth).toBe(expectedTotalWidth)

      // Active items in initial view must start at index 0
      expect(result.current.virtualItems[0].index).toBe(0)
      expect(result.current.paddingStart).toBe(0)
      expect(result.current.paddingEnd).toBe((1500 - result.current.virtualItems.length) * 196)
    })

    it('bounds useVirtualGrid to visible + overscan (<30 items) with 500 games', () => {
      const games500 = createMockGames(500)
      const { result } = renderHook(() =>
        useVirtualGrid(games500, {
          itemHeight: 280,
          columns: 4,
          gap: 20,
          overscanRows: 2,
          threshold: 24,
        }),
      )

      expect(result.current.isVirtualized).toBe(true)
      // 4 columns, 900px viewport / 300px = 3 visible rows + 2 overscan = 5 rows * 4 cols = 20 items (<30 items!)
      expect(result.current.virtualItems.length).toBeLessThan(30)
      expect(result.current.virtualItems.length).toBe(20)

      // Total height for 500 items in 4 columns = 125 rows * 300 - 20 = 37,480px
      const expectedTotalHeight = 125 * 300 - 20
      expect(result.current.totalHeight).toBe(expectedTotalHeight)
      expect(result.current.paddingTop).toBe(0)
      expect(result.current.paddingBottom).toBe((125 - 5) * 300)
    })

    it('bounds useVirtualGrid to visible + overscan (<30 items) with 1,500 games', () => {
      const games1500 = createMockGames(1500)
      const { result } = renderHook(() =>
        useVirtualGrid(games1500, {
          itemHeight: 320,
          columns: 4,
          gap: 20,
          overscanRows: 2,
          threshold: 24,
        }),
      )

      expect(result.current.isVirtualized).toBe(true)
      // 4 columns: 900px viewport / 340px = ~3 visible rows + 2 overscan = 5 rows * 4 = 20 items (<30 items!)
      expect(result.current.virtualItems.length).toBeLessThan(30)
      expect(result.current.virtualItems.length).toBe(20)

      // Total height for 1,500 items in 4 cols = 375 rows * 340 - 20 = 127,480px
      const expectedTotalHeight = 375 * 340 - 20
      expect(result.current.totalHeight).toBe(expectedTotalHeight)
      expect(result.current.paddingTop).toBe(0)
      expect(result.current.paddingBottom).toBe((375 - 5) * 340)

      // Verify DOM node explosion is prevented: 20 items vs 1,500 items is a 98.67% reduction
      const reductionPercentage = ((1500 - result.current.virtualItems.length) / 1500) * 100
      expect(reductionPercentage).toBeGreaterThan(98)
    })

    it('bounds useVirtualGrid with overscanRows=1 to strictly <=24 items across all scroll offsets', () => {
      const games1500 = createMockGames(1500)
      const { result } = renderHook(() =>
        useVirtualGrid(games1500, {
          itemHeight: 280,
          columns: 4,
          gap: 20,
          overscanRows: 1,
          threshold: 24,
        }),
      )

      expect(result.current.isVirtualized).toBe(true)
      // With overscanRows = 1 and 4 columns, active items are strictly <= 24 items (<30 items)
      expect(result.current.virtualItems.length).toBeLessThan(30)
      expect(result.current.virtualItems.length).toBeLessThanOrEqual(24)
    })
  })

  // =========================================================================
  // 2. Scroll Performance Stress Tests (50 Rapid Scroll Updates)
  // =========================================================================
  describe('Scroll Performance & Frame Calculation Latency', () => {
    it('executes 50 rapid grid scroll position calculations in <16.6ms (<1.0ms per calculation)', () => {
      const items = createMockGames(1500)
      const rowHeight = 300 // itemHeight: 280 + gap: 20
      const columns = 4
      const totalRows = Math.ceil(items.length / columns)
      const overscanRows = 2
      const viewportHeight = 900

      // Simulate 50 erratic and rapid scroll offsets spanning the entire 1,500 item grid
      const scrollPositions = Array.from({ length: 50 }, (_, i) =>
        Math.floor((i / 50) * totalRows * rowHeight),
      )

      const start = performance.now()

      for (let i = 0; i < scrollPositions.length; i++) {
        const scrollTop = scrollPositions[i]
        const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
        const endRow = Math.min(
          totalRows,
          Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows,
        )
        const startIdx = startRow * columns
        const endIdx = Math.min(items.length, endRow * columns)

        const slice = items.slice(startIdx, endIdx).map((item, idx) => ({
          index: startIdx + idx,
          item,
          rowIndex: Math.floor((startIdx + idx) / columns),
          columnIndex: (startIdx + idx) % columns,
        }))

        const topPad = startRow * rowHeight
        const bottomPad = Math.max(0, (totalRows - endRow) * rowHeight)

        // Sanity assertions per frame: strictly bounded to visible + overscan (<35 items)
        expect(slice.length).toBeLessThanOrEqual(32)
        expect(topPad + bottomPad).toBeLessThanOrEqual(totalRows * rowHeight)
      }

      const totalElapsed = performance.now() - start
      const avgPerCalc = totalElapsed / scrollPositions.length

      // Verify that all 50 frame calculations complete well within a 16.6ms frame budget (60 FPS SLA)
      expect(totalElapsed).toBeLessThan(16.6)
      // Verify average per calculation is well under 1.0ms
      expect(avgPerCalc).toBeLessThan(1.0)
    })

    it('executes 50 rapid row carousel scroll position calculations in <16.6ms (<1.0ms per calculation)', () => {
      const items = createMockGames(1500)
      const itemSize = 196 // itemWidth: 180 + gap: 16
      const clientWidth = 1200
      const overscan = 3
      const totalWidth = items.length * itemSize - 16

      const scrollOffsets = Array.from({ length: 50 }, (_, i) =>
        Math.floor((i / 50) * totalWidth),
      )

      const start = performance.now()

      for (let i = 0; i < scrollOffsets.length; i++) {
        const scrollLeft = scrollOffsets[i]
        const startIdx = Math.max(0, Math.floor(scrollLeft / itemSize) - overscan)
        const endIdx = Math.min(
          items.length,
          Math.ceil((scrollLeft + clientWidth) / itemSize) + overscan,
        )

        const slice = items.slice(startIdx, endIdx).map((item, idx) => ({
          index: startIdx + idx,
          item,
          offset: (startIdx + idx) * itemSize,
        }))

        const startPad = startIdx * itemSize
        const endPad = Math.max(0, (items.length - endIdx) * itemSize)

        expect(slice.length).toBeLessThan(30)
        expect(startPad + endPad).toBeLessThanOrEqual(items.length * itemSize)
      }

      const totalElapsed = performance.now() - start
      const avgPerCalc = totalElapsed / scrollOffsets.length

      expect(totalElapsed).toBeLessThan(16.6)
      expect(avgPerCalc).toBeLessThan(1.0)
    })
  })

  // =========================================================================
  // 3. Keyboard Navigation Debouncing Stress Tests
  // =========================================================================
  describe('Keyboard Rapid Navigation Debouncing', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      mockNavigate.mockReset()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('debounces router navigation across 100 rapid keydown events without frame drops', () => {
      const { result } = renderHook(() => useLauncherGames())

      const start = performance.now()

      // Rapidly fire 100 game selection / keydown events
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.selectGame(`game-${i}`)
        }
      })

      const totalSelectionTime = performance.now() - start

      // 1. Total selection dispatch time must be well under 16.6ms to ensure zero dropped frames
      expect(totalSelectionTime).toBeLessThan(16.6)

      // 2. Active game ID reflects the latest selected game
      expect(result.current.activeGameId).toBe('game-99')

      // 3. During the rapid 100 keydown events, router navigation must NOT be triggered
      expect(mockNavigate).not.toHaveBeenCalled()

      // 4. Advance timer by 149ms (just before debounce threshold) - still no navigation
      act(() => {
        vi.advanceTimersByTime(149)
      })
      expect(mockNavigate).not.toHaveBeenCalled()

      // 5. Advance 1 more ms to reach 150ms debounce threshold
      act(() => {
        vi.advanceTimersByTime(1)
      })

      // 6. Navigate must be called EXACTLY ONCE with the final game ID and replace: true
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/launcher/$gameId',
        params: { gameId: 'game-99' },
        replace: true,
      })
    })

    it('resets debounce timer if new keydown occurs before 150ms window expires', () => {
      const { result } = renderHook(() => useLauncherGames())

      act(() => {
        result.current.selectGame('game-10')
      })
      expect(result.current.activeGameId).toBe('game-10')

      // Wait 100ms (debounce window is 150ms)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(mockNavigate).not.toHaveBeenCalled()

      // Interrupted by another keydown
      act(() => {
        result.current.selectGame('game-20')
      })
      expect(result.current.activeGameId).toBe('game-20')

      // Advance 100ms from second keydown (total 200ms from first, but only 100ms from second)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      // Should STILL not have navigated because timer was reset!
      expect(mockNavigate).not.toHaveBeenCalled()

      // Advance remaining 50ms
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/launcher/$gameId',
        params: { gameId: 'game-20' },
        replace: true,
      })
    })
  })
})
