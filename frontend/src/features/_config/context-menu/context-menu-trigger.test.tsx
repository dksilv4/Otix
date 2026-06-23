import { describe, it, expect, vi, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContextMenuProvider } from './context-menu-context'
import { ContextMenuTrigger } from './context-menu-trigger'
import { ContextMenuPortal } from './context-menu-portal'
import type { ContextMenuItemDef } from './types'

// Make requestAnimationFrame execute immediately in tests (portal needs RAF)
const origRAF = globalThis.requestAnimationFrame
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0 }

const items: ContextMenuItemDef[] = [
  { id: '1', label: 'Action', onClick: vi.fn() },
]

describe('ContextMenuTrigger', () => {
  afterAll(() => { globalThis.requestAnimationFrame = origRAF })

  it('renders children', () => {
    render(
      <ContextMenuProvider>
        <ContextMenuTrigger items={items}>
          <button>Target</button>
        </ContextMenuTrigger>
      </ContextMenuProvider>,
    )
    expect(screen.getByText('Target')).toBeInTheDocument()
  })

  it('opens menu on right-click', async () => {
    render(
      <ContextMenuProvider>
        <ContextMenuTrigger items={items}>
          <div data-testid="target">Target</div>
        </ContextMenuTrigger>
        <ContextMenuPortal />
      </ContextMenuProvider>,
    )
    const target = screen.getByTestId('target')
    fireEvent.contextMenu(target, { clientX: 100, clientY: 200 })
    await waitFor(() => {
      expect(screen.getByText('Action')).toBeInTheDocument()
    })
  })
})
