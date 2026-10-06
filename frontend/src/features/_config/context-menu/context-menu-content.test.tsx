import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContextMenuProvider } from './context-menu-context'
import { ContextMenuContent } from './context-menu-content'
import type { ContextMenuItemDef } from './types'

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  return <ContextMenuProvider>{children}</ContextMenuProvider>
};

describe('ContextMenuContent', () => {
  const items: ContextMenuItemDef[] = [
    { id: '1', label: 'Watched', onClick: vi.fn() },
    { id: '2', label: 'Delete', destructive: true, onClick: vi.fn() },
    { id: '3', label: 'Disabled', disabled: true, onClick: vi.fn() },
  ]

  it('renders all items', () => {
    render(<ContextMenuContent items={items} />, { wrapper: Wrapper })
    expect(screen.getByText('Watched')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('renders separators between groups', () => {
    const withSep = [
      { id: '1', label: 'A', onClick: vi.fn() },
      { id: '_s1', separator: true as any },
      { id: '2', label: 'B', onClick: vi.fn() },
    ] as ContextMenuItemDef[]
    render(<ContextMenuContent items={withSep} />, { wrapper: Wrapper })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(document.querySelector('[role="separator"]')).toBeInTheDocument()
  })

  it('applies role="menu"', () => {
    render(<ContextMenuContent items={items} />, { wrapper: Wrapper })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
