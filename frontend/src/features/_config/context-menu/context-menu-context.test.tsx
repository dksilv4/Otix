import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ContextMenuProvider, useMenuContext } from './context-menu-context'

describe('ContextMenuProvider', () => {
  it('provides closed state by default', () => {
    const { result } = renderHook(() => useMenuContext(), {
      wrapper: ({ children }) => (
        <ContextMenuProvider>{children}</ContextMenuProvider>
      ),
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.position).toBeNull()
    expect(result.current.items).toEqual([])
  })

  it('throws when used outside provider', () => {
    expect(() => renderHook(() => useMenuContext())).toThrow(
      'useMenuContext must be used within ContextMenuProvider'
    )
  })
})
