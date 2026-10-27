import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuDropdown } from '../navigation-sidebar'

const mockClose = vi.fn()

vi.mock('@navigation/hooks/use-navigation', () => ({
  useNavigation: () => ({
    isOpen: true,
    close: mockClose,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  Link: ({
    to,
    children,
    onClick,
    className,
  }: {
    to: string
    children: React.ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/desktop/platform', () => ({
  useDesktopPlatform: () => ({ isDesktop: false }),
}))

vi.mock('@/features/chat', () => ({
  useChatUnreadCountQuery: () => ({ data: { count: 3 } }),
}))

describe('MenuDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders primary navigation items without Friends, Welcome Guide, or Documentation', () => {
    render(<MenuDropdown />)

    // Expected items present
    expect(screen.getByText('Discover')).toBeDefined()
    expect(screen.getByText('Search')).toBeDefined()
    expect(screen.getByText('Calendar')).toBeDefined()
    expect(screen.getByText('Launcher')).toBeDefined()
    expect(screen.getByText('Library')).toBeDefined()
    expect(screen.getByText('Messages')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
    expect(screen.getByText('Downloads')).toBeDefined()

    // Items that must NOT be present in main menu dropdown
    expect(screen.queryByText('Friends')).toBeNull()
    expect(screen.queryByText('Welcome Guide')).toBeNull()
    expect(screen.queryByText('Documentation')).toBeNull()
  })

  it('closes dropdown on Escape key', () => {
    render(<MenuDropdown />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('closes dropdown when clicking outside', () => {
    render(<MenuDropdown />)
    fireEvent.mouseDown(document.body)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
