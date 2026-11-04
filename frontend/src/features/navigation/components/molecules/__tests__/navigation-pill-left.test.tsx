import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavPillLeft } from '../navigation-pill-left'

let mockIsOpen = false
const mockClose = vi.fn()
const mockToggle = vi.fn()
let mockPathname = '/'

vi.mock('@navigation/hooks/use-navigation', () => ({
  useNavigation: () => ({
    isOpen: mockIsOpen,
    close: mockClose,
    toggle: mockToggle,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useRouter: () => ({
    history: { back: vi.fn() },
    navigate: vi.fn(),
  }),
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

vi.mock('@/lib/providers/page-context', () => ({
  usePageMeta: () => ({ navLogo: null }),
}))

vi.mock('@/lib/desktop/platform', () => ({
  useDesktopPlatform: () => ({ isDesktop: false, platform: 'win32' }),
  getDesktopPlatform: () => ({ isDesktop: false, platform: 'win32', isWindows: true, isMac: false, isLinux: false }),
}))

vi.mock('@/features/chat', () => ({
  useChatUnreadCountQuery: () => ({ data: { count: 5 } }),
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

const renderWithContext = (ui: React.ReactNode) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

describe('NavPillLeft (Floating Navigation Island)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsOpen = false
    mockPathname = '/'
  })

  it('renders collapsed navigation pill on home page without back button', () => {
    mockIsOpen = false
    mockPathname = '/'
    renderWithContext(<NavPillLeft />)

    expect(screen.getByRole('button', { name: /toggle menu/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /go back/i })).toBeNull()
    // Dropdown content should not be visible when collapsed
    expect(screen.queryByText('Discover')).toBeNull()
  })

  it('renders back button when on non-home page route', () => {
    mockIsOpen = false
    mockPathname = '/media/movie/550'
    renderWithContext(<NavPillLeft />)

    expect(screen.getByRole('button', { name: /go back/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /toggle menu/i })).toBeDefined()
  })

  it('expands smoothly to display menu items when isOpen is true', () => {
    mockIsOpen = true
    mockPathname = '/'
    renderWithContext(<NavPillLeft />)

    expect(screen.getByText('Discover')).toBeDefined()
    expect(screen.getByText('Search')).toBeDefined()
    expect(screen.getByText('Calendar')).toBeDefined()
    expect(screen.getByText('Launcher')).toBeDefined()
    expect(screen.getByText('Library')).toBeDefined()
    expect(screen.getByText('Messages')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
    expect(screen.getByText('Downloads')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined() // unread chat badge
  })

  it('closes dropdown when Escape key is pressed while open', () => {
    mockIsOpen = true
    renderWithContext(<NavPillLeft />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('closes dropdown when clicking outside while open', () => {
    mockIsOpen = true
    renderWithContext(<NavPillLeft />)

    fireEvent.mouseDown(document.body)
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
