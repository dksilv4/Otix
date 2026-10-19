import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserMenu } from '../components/organisms/auth-user-menu'
import { PanelProvider } from '@/features/activity/providers/panel-context'

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/launcher', () => ({
  useRunningGame: () => ({ runningGame: null, elapsedMs: 0 }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}))

vi.mock('@/features/friends', () => ({
  useFriends: () => ({
    friends: [
      { id: 10, username: 'sara', avatarUrl: null, isOnline: true },
    ],
    activeNowFriends: [
      {
        friend: { id: 10, username: 'sara', avatarUrl: null, isOnline: true },
        state: 'active_now',
        stateLabel: 'Playing Counter-Strike 2',
        latestActivity: {
          mediaItem: { mediaType: 'game', title: 'Counter-Strike 2' },
        },
      },
    ],
    totalCount: 1,
    activeCount: 1,
    isLoading: false,
  }),
  useFriendRequests: () => ({
    incoming: [],
    incomingCount: 0,
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    isAccepting: false,
    isRejecting: false,
  }),
  FriendAvatar: () => <div data-testid="friend-avatar" />,
  AddFriendModal: () => null,
  filterFriends: (friends: any[]) => friends,
}))

import { useAuth } from '@auth/hooks/use-auth'

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
      <PanelProvider>{ui}</PanelProvider>
    </QueryClientProvider>,
  )
}

describe('UserMenu with XPProgressRing and Friends integration', () => {
  it('renders circular XP progress bar around avatar in bare right nav mode', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: '1',
        email: 'user@example.com',
        username: 'testgamer',
        totalXp: 450, // Level 2 (300 XP per level, 150/300 into level 2 -> 50%)
        isVerified: true,
        twoFactorEnabled: false,
      },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
      login: vi.fn(),
      verifyTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
      twoFactorChallenge: null,
    })

    renderWithContext(<UserMenu bare />)

    const button = screen.getByRole('button', { name: /User menu, Level 2/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('title', expect.stringContaining('Level 2'))

    // SVG circular progress ring elements
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
    const circles = button.querySelectorAll('circle')
    expect(circles.length).toBe(2) // 1 track circle + 1 progress arc
  })

  it('renders integrated friends section inside dropdown when opened', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: '1',
        email: 'user@example.com',
        username: 'testgamer',
        totalXp: 450,
        isVerified: true,
        twoFactorEnabled: false,
      },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
      login: vi.fn(),
      verifyTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
      twoFactorChallenge: null,
    })

    renderWithContext(<UserMenu bare />)

    const trigger = screen.getByRole('button', { name: /User menu, Level 2/i })
    fireEvent.click(trigger)

    expect(screen.getByText('Friends Hub')).toBeInTheDocument()
    expect(screen.getByText('sara')).toBeInTheDocument()
    expect(screen.getByText('Playing Counter-Strike 2')).toBeInTheDocument()
  })

  it('renders sign in button when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn(),
      login: vi.fn(),
      verifyTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
      twoFactorChallenge: null,
    })

    renderWithContext(<UserMenu bare />)

    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})
