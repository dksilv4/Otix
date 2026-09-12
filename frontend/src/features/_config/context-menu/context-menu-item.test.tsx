import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Heart } from 'lucide-react'
import { ContextMenuItem } from './context-menu-item'
import { ContextMenuSeparator } from './context-menu-separator'

describe('ContextMenuItem', () => {
  it('renders label', () => {
    render(<ContextMenuItem label="Add to Library" />)
    expect(screen.getByText('Add to Library')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<ContextMenuItem label="Like" icon={Heart} />)
    const svg = document.querySelector('.lucide-heart')
    expect(svg).toBeInTheDocument()
  })

  it('renders shortcut hint', () => {
    render(<ContextMenuItem label="Copy" shortcut="⌘C" />)
    expect(screen.getByText('⌘C')).toBeInTheDocument()
  })

  it('applies disabled attributes', () => {
    render(<ContextMenuItem label="Delete" disabled />)
    const btn = screen.getByRole('menuitem')
    expect(btn).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<ContextMenuItem label="Test" onClick={onClick} />)
    screen.getByRole('menuitem').click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(<ContextMenuItem label="Test" disabled onClick={onClick} />)
    screen.getByRole('menuitem').click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders submenu chevron when has subItems', () => {
    render(<ContextMenuItem label="More" hasSubMenu />)
    const chevron = document.querySelector('.lucide-chevron-right')
    expect(chevron).toBeInTheDocument()
  })
})

describe('ContextMenuSeparator', () => {
  it('renders a divider with role separator', () => {
    const { container } = render(<ContextMenuSeparator />)
    expect(container.querySelector('[role="separator"]')).toBeInTheDocument()
  })
})
