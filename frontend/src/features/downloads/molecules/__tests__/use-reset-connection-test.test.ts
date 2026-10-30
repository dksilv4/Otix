import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useResetConnectionTest } from '../use-reset-connection-test'

describe('useResetConnectionTest', () => {
  it('does not call reset on initial render', () => {
    const reset = vi.fn()
    renderHook(() =>
      useResetConnectionTest(
        { host: 'localhost', port: 8080, apiKey: 'abc' },
        reset,
      ),
    )
    expect(reset).not.toHaveBeenCalled()
  })

  it('calls reset when object dependencies change', () => {
    const reset = vi.fn()
    let deps = { host: 'localhost', port: 8080, apiKey: 'abc' }
    const { rerender } = renderHook(() => useResetConnectionTest(deps, reset))

    expect(reset).not.toHaveBeenCalled()

    deps = { host: 'localhost', port: 8081, apiKey: 'abc' }
    rerender()

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('does not call reset when re-rendered with identical values', () => {
    const reset = vi.fn()
    let deps = { host: 'localhost', port: 8080, apiKey: 'abc' }
    const { rerender } = renderHook(() => useResetConnectionTest(deps, reset))

    deps = { host: 'localhost', port: 8080, apiKey: 'abc' }
    rerender()

    expect(reset).not.toHaveBeenCalled()
  })

  it('supports array dependencies and calls reset when an element changes', () => {
    const reset = vi.fn()
    let deps = ['email@test.com', 'password', 'device-1'] as const
    const { rerender } = renderHook(() => useResetConnectionTest(deps, reset))

    expect(reset).not.toHaveBeenCalled()

    deps = ['email@test.com', 'password', 'device-2'] as const
    rerender()

    expect(reset).toHaveBeenCalledTimes(1)
  })
})
