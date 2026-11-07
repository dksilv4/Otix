import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProgressiveRender } from '../use-progressive-render'

describe('useProgressiveRender', () => {
  const dummyItems = Array.from({ length: 200 }, (_, i) => `item-${i + 1}`)

  it('initially renders up to initialCount items', () => {
    const { result } = renderHook(() =>
      useProgressiveRender({
        items: dummyItems,
        initialCount: 50,
        step: 25,
      }),
    )

    expect(result.current.visibleItems.length).toBe(50)
    expect(result.current.visibleItems[0]).toBe('item-1')
    expect(result.current.visibleItems[49]).toBe('item-50')
    expect(result.current.hasMore).toBe(true)
  })

  it('increments visible items upon calling loadMore', () => {
    const { result } = renderHook(() =>
      useProgressiveRender({
        items: dummyItems,
        initialCount: 50,
        step: 25,
      }),
    )

    act(() => {
      result.current.loadMore()
    })

    expect(result.current.visibleItems.length).toBe(75)
    expect(result.current.hasMore).toBe(true)

    act(() => {
      result.current.loadMore()
    })

    expect(result.current.visibleItems.length).toBe(100)
  })

  it('resets visible count when resetDeps change', () => {
    let filter = 'all'
    const { result, rerender } = renderHook(() =>
      useProgressiveRender({
        items: dummyItems,
        initialCount: 50,
        step: 25,
        resetDeps: [filter],
      }),
    )

    act(() => {
      result.current.loadMore()
    })
    expect(result.current.visibleItems.length).toBe(75)

    filter = 'plex'
    rerender()

    expect(result.current.visibleItems.length).toBe(50)
  })
})
