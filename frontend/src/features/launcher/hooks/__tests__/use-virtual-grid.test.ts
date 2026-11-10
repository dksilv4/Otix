import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVirtualRow, useVirtualGrid } from '../use-virtual-grid'

describe('useVirtualRow', () => {
  const createMockItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `game-${i}`,
      title: `Game ${i}`,
    }))

  it('does not virtualize small lists under threshold', () => {
    const items = createMockItems(12)
    const { result } = renderHook(() =>
      useVirtualRow(items, { itemWidth: 200, gap: 16, threshold: 24 }),
    )

    expect(result.current.isVirtualized).toBe(false)
    expect(result.current.virtualItems).toHaveLength(12)
    expect(result.current.paddingStart).toBe(0)
    expect(result.current.paddingEnd).toBe(0)
    expect(result.current.totalWidth).toBe(12 * (200 + 16) - 16)
  })

  it('bounds active items when list exceeds threshold', () => {
    const items = createMockItems(100)
    const { result } = renderHook(() =>
      useVirtualRow(items, {
        itemWidth: 200,
        gap: 16,
        overscan: 2,
        threshold: 24,
      }),
    )

    expect(result.current.isVirtualized).toBe(true)
    // Only visible window + overscan items should be mounted, far fewer than 100
    expect(result.current.virtualItems.length).toBeLessThan(20)
    expect(result.current.virtualItems.length).toBeGreaterThan(0)
    expect(result.current.paddingEnd).toBeGreaterThan(0)
    expect(result.current.totalWidth).toBe(100 * 216 - 16)
  })

  it('scrollToIndex targets expected scroll position', () => {
    const items = createMockItems(50)
    const { result } = renderHook(() =>
      useVirtualRow(items, { itemWidth: 200, gap: 16 }),
    )

    const mockScrollTo = vi.fn()
    const mockEl = {
      scrollLeft: 0,
      clientWidth: 800,
      scrollTo: mockScrollTo,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLDivElement

    // Attach mock element
    ;(result.current.containerRef as { current: HTMLDivElement | null }).current = mockEl

    act(() => {
      result.current.scrollToIndex(10, 'smooth')
    })

    expect(mockScrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: 'smooth',
      }),
    )
    const callArg = mockScrollTo.mock.calls[0][0]
    expect(callArg.left).toBeGreaterThan(0)
  })
})

describe('useVirtualGrid', () => {
  const createMockItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `game-${i}`,
      title: `Game ${i}`,
    }))

  it('does not virtualize when item count is below threshold', () => {
    const items = createMockItems(10)
    const { result } = renderHook(() =>
      useVirtualGrid(items, { itemHeight: 280, columns: 5, threshold: 24 }),
    )

    expect(result.current.isVirtualized).toBe(false)
    expect(result.current.virtualItems).toHaveLength(10)
    expect(result.current.paddingTop).toBe(0)
    expect(result.current.paddingBottom).toBe(0)
    expect(result.current.columns).toBe(5)
  })

  it('bounds active items to a small window for 500-game libraries', () => {
    const items = createMockItems(500)
    const { result } = renderHook(() =>
      useVirtualGrid(items, {
        itemHeight: 280,
        columns: 5,
        gap: 20,
        overscanRows: 2,
        threshold: 24,
      }),
    )

    expect(result.current.isVirtualized).toBe(true)
    // For 500 items across 5 columns, total rows = 100.
    // Active mounted items should only be ~4-6 rows * 5 = 20-30 items, not 500!
    expect(result.current.virtualItems.length).toBeLessThanOrEqual(35)
    expect(result.current.virtualItems.length).toBeGreaterThan(0)
    expect(result.current.paddingTop).toBe(0)
    expect(result.current.paddingBottom).toBeGreaterThan(0)
    expect(result.current.totalHeight).toBe(100 * 300 - 20)
  })

  it('resolves dynamic column counts via function option', () => {
    const items = createMockItems(50)
    const getCols = (width: number) => (width >= 1200 ? 6 : 3)

    const { result } = renderHook(() =>
      useVirtualGrid(items, {
        itemHeight: 250,
        columns: getCols,
        threshold: 24,
      }),
    )

    expect(result.current.columns).toBeGreaterThanOrEqual(3)
  })

  it('handles scrollToIndex in container mode', () => {
    const items = createMockItems(100)
    const { result } = renderHook(() =>
      useVirtualGrid(items, {
        itemHeight: 200,
        columns: 4,
        gap: 20,
      }),
    )

    const mockScrollTo = vi.fn()
    const mockEl = {
      scrollTop: 0,
      clientHeight: 600,
      scrollTo: mockScrollTo,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLDivElement

    ;(result.current.containerRef as { current: HTMLDivElement | null }).current = mockEl

    act(() => {
      result.current.scrollToIndex(20)
    })

    expect(mockScrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        top: Math.floor(20 / 4) * 220, // row 5 * 220 = 1100
        behavior: 'smooth',
      }),
    )
  })
})
