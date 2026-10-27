import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { ContextMenuPortal } from '../context-menu-portal'
import * as contextModule from '../context-menu-context'

describe('ContextMenuPortal - 150ms settle delay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores outside scroll events during the 150ms settle delay', () => {
    const close = vi.fn()
    vi.spyOn(contextModule, 'useMenuContext').mockReturnValue({
      isOpen: true,
      position: { x: 100, y: 100 },
      items: [{ id: 'test', label: 'Test' }],
      close,
      open: vi.fn(),
    })

    render(<ContextMenuPortal />)

    // Fire scroll event immediately (t = 20ms < 150ms)
    act(() => {
      vi.advanceTimersByTime(20)
      window.dispatchEvent(new Event('scroll'))
    })

    // Should NOT close
    expect(close).not.toHaveBeenCalled()

    // Fire wheel event at t = 100ms (< 150ms)
    act(() => {
      vi.advanceTimersByTime(80)
      window.dispatchEvent(new Event('wheel'))
    })

    // Should still NOT close
    expect(close).not.toHaveBeenCalled()

    // Now advance past the 150ms settle delay (t = 160ms >= 150ms)
    act(() => {
      vi.advanceTimersByTime(60)
      window.dispatchEvent(new Event('scroll'))
    })

    // Should close now!
    expect(close).toHaveBeenCalledTimes(1)
  })
})
