import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounceValue } from '../use-debounce'

describe('useDebounceValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounceValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('updates value only after delay', () => {
    const { result, rerender } = renderHook(
      ({ val, delay }) => useDebounceValue(val, delay),
      { initialProps: { val: 'first', delay: 300 } },
    )

    expect(result.current).toBe('first')

    rerender({ val: 'second', delay: 300 })
    expect(result.current).toBe('first')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('first')

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('second')
  })
})
