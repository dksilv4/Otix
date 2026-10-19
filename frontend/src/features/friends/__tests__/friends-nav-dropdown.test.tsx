import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { FriendsNavDropdown } from '../components/organisms/friends-nav-dropdown'

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isAuthenticated: true,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
    onClick,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    className?: string
    onClick?: () => void
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('../hooks/use-friends', () => ({
  useFriends: () => ({
    friends: [
      { id: 1, username: 'aragorn', avatarUrl: null, friendsSince: '2024-01-01' },
      { id: 2, username: 'legolas', avatarUrl: null, friendsSince: '2024-02-01' },
    ],
    activeFriends: [
      {
        friend: { id: 1, username: 'aragorn', avatarUrl: null, friendsSince: '2024-01-01' },
        state: 'active_now',
        stateLabel: 'Active now',
      },
    ],
    activeNowFriends: [
      {
        friend: { id: 1, username: 'aragorn', avatarUrl: null, friendsSince: '2024-01-01' },
        state: 'active_now',
        stateLabel: 'Active now',
      },
    ],
    totalCount: 2,
    activeCount: 1,
    isLoading: false,
  }),
}))

vi.mock('../hooks/use-friend-requests', () => ({
  useFriendRequests: () => ({
    incoming: [],
    outgoing: [],
    incomingCount: 0,
    outgoingCount: 0,
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    isAccepting: false,
    isRejecting: false,
  }),
}))

describe('FriendsNavDropdown', () => {
  it('renders dropdown trigger button', () => {
    render(<FriendsNavDropdown bare />, { wrapper: createWrapper() })
    const btn = screen.getByRole('button', { name: /friends menu/i })
    expect(btn).toBeInTheDocument()
  })

  it('opens dropdown menu on click showing friends and active state', () => {
    render(<FriendsNavDropdown bare />, { wrapper: createWrapper() })
    const trigger = screen.getByRole('button', { name: /friends menu/i })

    // Open
    fireEvent.click(trigger)

    expect(screen.getByText('Friends')).toBeInTheDocument()
    expect(screen.getByText('1 online')).toBeInTheDocument()
    expect(screen.getByText(/Active Now/)).toBeInTheDocument()
    expect(screen.getAllByText('aragorn').length).toBeGreaterThan(0)
    expect(screen.getByText('legolas')).toBeInTheDocument()
    expect(screen.getByText('View All Friends')).toBeInTheDocument()
  })
})
