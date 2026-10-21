import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { JoinGameServerPage } from '../pages/join-game-server-page'
import type { DedicatedGameServer, GameServerInvite } from '../types'

const mockNavigate = vi.fn()
const mockToast = vi.fn()
const mockMutateAsync = vi.fn()
const mockOpenExternal = vi.fn()

let mockParams = { code: 'test-code-123' }
let mockAuth = {
  user: null as { id: number; username: string } | null,
  isAuthenticated: false,
  isLoading: false,
}
let mockInviteQuery = {
  data: undefined as { invite: GameServerInvite; server: DedicatedGameServer } | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('@/lib/utils/open-external', () => ({
  openExternal: (url: string) => mockOpenExternal(url),
}))

vi.mock('../queries/gameservers-queries', () => ({
  useResolveGameServerInvite: () => mockInviteQuery,
  useJoinGameServerInvite: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isSuccess: false,
  }),
}))

const sampleServer: DedicatedGameServer = {
  id: 10,
  name: "Dan's Palworld World",
  gameTitle: 'Palworld',
  mediaItemId: 'palworld-game',
  mediaItemTitle: 'Palworld',
  mediaItemPoster: 'https://images.example.com/palworld.jpg',
  serverType: 'steam_source',
  host: '127.0.0.1',
  port: 8211,
  queryPort: 27015,
  password: 'mypassword',
  description: 'Come play with us! Casual difficulty.',
  isPublicLink: true,
  status: 'online',
  currentPlayers: 4,
  maxPlayers: 16,
  playerList: ['PlayerA', 'PlayerB'],
  currentMap: 'Palpagos Islands',
  connectionAddress: '127.0.0.1:8211',
  ownerUsername: 'dan',
  isOwner: false,
  isMember: false,
  userPermission: 'viewer',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const sampleInvite: GameServerInvite = {
  id: 1,
  code: 'test-code-123',
  serverId: 10,
  isActive: true,
  uses: 5,
  isValid: true,
  createdAt: '2026-01-01T00:00:00Z',
}

describe('JoinGameServerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams = { code: 'test-code-123' }
    mockAuth = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }
    mockInviteQuery = {
      data: { invite: sampleInvite, server: sampleServer },
      isLoading: false,
      isError: false,
      error: null,
    }
  })

  const renderComponent = () =>
    render(
      <HelmetProvider>
        <JoinGameServerPage />
      </HelmetProvider>,
    )

  it('renders loading state when invite is loading', () => {
    mockInviteQuery = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    }

    renderComponent()
    expect(screen.getByText('Loading server invite...')).toBeDefined()
  })

  it('renders error state when invite link is invalid or expired', () => {
    mockInviteQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { data: { detail: 'Invalid or expired invite link' } } },
    }

    renderComponent()
    expect(screen.getByText('Invite Link Unavailable')).toBeDefined()
    expect(screen.getByText('Invalid or expired invite link')).toBeDefined()

    fireEvent.click(screen.getByText('Go to My Game Servers'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/game-servers' })
  })

  it('renders unauthenticated guest view with sign in and create account buttons', () => {
    mockAuth = { user: null, isAuthenticated: false, isLoading: false }

    renderComponent()
    expect(screen.getByText("Dan's Palworld World")).toBeDefined()
    expect(screen.getByText('Palworld')).toBeDefined()
    expect(screen.getByText('Sign in to join this server')).toBeDefined()
    expect(screen.getByText('Sign In to Join')).toBeDefined()
    expect(screen.getByText('Create Account')).toBeDefined()

    fireEvent.click(screen.getByText('Sign In to Join'))
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/auth/login',
      }),
    )
  })

  it('renders authenticated non-member view with Join Game Server button', async () => {
    mockAuth = {
      user: { id: 2, username: 'charlie' },
      isAuthenticated: true,
      isLoading: false,
    }
    mockMutateAsync.mockResolvedValueOnce({ ...sampleServer, isMember: true })

    renderComponent()
    expect(screen.getByText('Ready to join?')).toBeDefined()
    const joinButton = screen.getByText('Join Game Server')
    expect(joinButton).toBeDefined()

    await act(async () => {
      fireEvent.click(joinButton)
    })
    expect(mockMutateAsync).toHaveBeenCalledWith('test-code-123')
  })

  it('renders member view with direct connect details, password, and steam join', () => {
    mockAuth = {
      user: { id: 2, username: 'charlie' },
      isAuthenticated: true,
      isLoading: false,
    }
    mockInviteQuery = {
      data: {
        invite: sampleInvite,
        server: { ...sampleServer, isMember: true },
      },
      isLoading: false,
      isError: false,
      error: null,
    }

    renderComponent()
    expect(screen.getByText('You have joined this server')).toBeDefined()
    expect(screen.getByText('127.0.0.1:8211')).toBeDefined()
    expect(screen.getByText('1-Click Steam Join')).toBeDefined()
    expect(screen.getByText('All Game Servers')).toBeDefined()
    expect(screen.getByText('View Game Details')).toBeDefined()

    fireEvent.click(screen.getByText('1-Click Steam Join'))
    expect(mockOpenExternal).toHaveBeenCalled()
  })
})
