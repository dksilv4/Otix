import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavPillRight } from '../navigation-pill-right'

let mockIsUserMenuOpen = false
const mockSetUserMenuOpen = vi.fn()
let mockIsChatOpen = false
const mockSetChatOpen = vi.fn()
const mockToggleSidebar = vi.fn()
const mockCloseSidebar = vi.fn()

vi.mock('@activity/providers/panel-context', () => ({
  usePanelContext: () => ({
    isUserMenuOpen: mockIsUserMenuOpen,
    setUserMenuOpen: mockSetUserMenuOpen,
    isChatOpen: mockIsChatOpen,
    setChatOpen: mockSetChatOpen,
  }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    modals: [],
    closeAll: vi.fn(),
  }),
}))

vi.mock('@/lib/desktop/platform', () => ({
  useDesktopPlatform: () => ({ isDesktop: false, platform: 'win32' }),
  getDesktopPlatform: () => ({ isDesktop: false, platform: 'win32', isWindows: true, isMac: false, isLinux: false }),
}))

vi.mock('@auth', () => ({
  UserMenu: () => <div data-testid="user-menu-trigger">UserMenu</div>,
  UserMenuContent: () => <div data-testid="user-menu-content">UserMenuContent</div>,
}))

vi.mock('@activity/components/atoms/activity-nav-button', () => ({
  ActivityModuleButton: () => <div data-testid="activity-module-button">ActivityModuleButton</div>,
}))

vi.mock('@activity/components/organisms/activity-panel', () => ({
  ActivityPanelContent: () => <div data-testid="activity-panel-content">ActivityPanelContent</div>,
}))

vi.mock('@/features/chat', () => ({
  ChatNavButton: () => <div data-testid="chat-nav-button">ChatNavButton</div>,
  ChatNavPanelContent: () => <div data-testid="chat-nav-panel-content">ChatNavPanelContent</div>,
}))

vi.mock('../navigation-search', () => ({
  NavSearch: () => <div data-testid="nav-search">NavSearch</div>,
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

const renderWithContext = (props: Partial<Parameters<typeof NavPillRight>[0]> = {}) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <NavPillRight
        isPinned={false}
        isSidebarOpen={false}
        onToggleSidebar={mockToggleSidebar}
        onCloseSidebar={mockCloseSidebar}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('NavPillRight (Floating Navigation Island)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsUserMenuOpen = false
    mockIsChatOpen = false
  })

  it('renders collapsed navigation pill with all action triggers', () => {
    renderWithContext()

    expect(screen.getByTestId('nav-search')).toBeDefined()
    expect(screen.getByTestId('chat-nav-button')).toBeDefined()
    expect(screen.getByTestId('user-menu-trigger')).toBeDefined()
    expect(screen.getByTestId('activity-module-button')).toBeDefined()
    expect(screen.queryByRole('button', { name: /collapse menu/i })).toBeNull()
    expect(screen.queryByTestId('chat-nav-panel-content')).toBeNull()
    expect(screen.queryByTestId('user-menu-content')).toBeNull()
    expect(screen.queryByTestId('activity-panel-content')).toBeNull()
  })

  it('expands and renders Chat panel when isChatOpen is true', () => {
    mockIsChatOpen = true
    renderWithContext()

    expect(screen.getByTestId('chat-nav-panel-content')).toBeDefined()
    expect(screen.getByRole('button', { name: /collapse menu/i })).toBeDefined()
  })

  it('expands and renders User Menu content when isUserMenuOpen is true', () => {
    mockIsUserMenuOpen = true
    renderWithContext()

    expect(screen.getByTestId('user-menu-content')).toBeDefined()
    expect(screen.getByRole('button', { name: /collapse menu/i })).toBeDefined()
  })

  it('expands and renders Activity panel when isSidebarOpen is true', () => {
    renderWithContext({ isSidebarOpen: true })

    expect(screen.getByTestId('activity-panel-content')).toBeDefined()
    expect(screen.getByRole('button', { name: /collapse menu/i })).toBeDefined()
  })

  it('collapses expanded state when collapse button is clicked', () => {
    mockIsChatOpen = true
    renderWithContext()

    const collapseBtn = screen.getByRole('button', { name: /collapse menu/i })
    fireEvent.click(collapseBtn)

    expect(mockSetChatOpen).toHaveBeenCalledWith(false)
  })

  it('closes dropdown when Escape key is pressed while expanded', () => {
    mockIsUserMenuOpen = true
    renderWithContext()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockSetUserMenuOpen).toHaveBeenCalledWith(false)
  })

  it('closes dropdown when clicking outside while expanded', () => {
    mockIsUserMenuOpen = true
    renderWithContext()

    fireEvent.mouseDown(document.body)
    expect(mockSetUserMenuOpen).toHaveBeenCalledWith(false)
  })
})
