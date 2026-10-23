import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SettingsGameServersPage } from '../pages/settings-game-servers-page'
import * as serverProbeModule from '@/features/gameservers/utils/server-probe'
import type { DedicatedGameServer } from '@/features/gameservers'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isAuthenticated: true,
  }),
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: vi.fn(),
}))

const mockServers: DedicatedGameServer[] = [
  {
    id: 101,
    name: 'Survival SMP',
    gameTitle: 'Minecraft',
    serverType: 'minecraft',
    host: 'mc.example.com',
    port: 25565,
    status: 'online',
    currentPlayers: 4,
    maxPlayers: 20,
    playerList: ['Player1'],
    pingMs: 25,
    connectionAddress: 'mc.example.com:25565',
    ownerUsername: 'testuser',
    isOwner: true,
    userPermission: 'admin',
    isPublicLink: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

vi.mock('@/features/gameservers/queries/gameservers-queries', () => ({
  useGameServers: () => ({
    data: mockServers,
    isLoading: false,
  }),
  useDeleteGameServer: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  gameServersKeys: {
    all: ['game-servers'],
    lists: () => ['game-servers', 'list'],
    list: () => ['game-servers', 'list'],
    detail: (id: number) => ['game-servers', 'detail', id],
    byGame: (id: string) => ['game-servers', 'by-game', id],
  },
}))

describe('SettingsGameServersPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('renders server details and triggers refresh from user PC while on the page', async () => {
    const probeSpy = vi
      .spyOn(serverProbeModule, 'probeServerFromClient')
      .mockResolvedValue({
        status: 'online',
        pingMs: 14,
        currentPlayers: 5,
        maxPlayers: 20,
      })

    const refreshSpy = vi
      .spyOn(serverProbeModule, 'refreshGameServerStatus')
      .mockResolvedValue({
        server: {
          ...mockServers[0],
          status: 'online',
          pingMs: 14,
          currentPlayers: 5,
        },
        fromClient: true,
      })

    render(<SettingsGameServersPage />, { wrapper })

    expect(screen.getByText('Survival SMP')).toBeInTheDocument()
    expect(screen.getByText('25ms')).toBeInTheDocument()
    expect(screen.getByText('mc.example.com:25565')).toBeInTheDocument()

    // Assert refresh was initiated from user PC on mount
    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
      expect(refreshSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
    })
  })

  it('allows user to manually trigger single server refresh from their PC', async () => {
    const refreshSpy = vi
      .spyOn(serverProbeModule, 'refreshGameServerStatus')
      .mockResolvedValue({
        server: {
          ...mockServers[0],
          status: 'online',
          pingMs: 9,
        },
        fromClient: true,
      })

    const user = userEvent.setup()
    render(<SettingsGameServersPage />, { wrapper })

    const refreshBtn = screen.getByTitle('Query live server status from your PC')
    await user.click(refreshBtn)

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
    })
  })

  it('provides a global Refresh button in the header', async () => {
    const refreshSpy = vi
      .spyOn(serverProbeModule, 'refreshGameServerStatus')
      .mockResolvedValue({
        server: mockServers[0],
        fromClient: true,
      })

    const user = userEvent.setup()
    render(<SettingsGameServersPage />, { wrapper })

    const refreshAllBtn = screen.getByTitle('Refresh all server statuses and ping from your PC')
    expect(refreshAllBtn).toBeInTheDocument()
    await user.click(refreshAllBtn)

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalled()
    })
  })
})
