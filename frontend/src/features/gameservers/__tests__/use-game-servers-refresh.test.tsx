import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGameServersRefresh } from '../hooks/use-game-servers-refresh'
import { gameServersKeys } from '../queries/gameservers-queries'
import * as serverProbeModule from '../utils/server-probe'
import type { DedicatedGameServer, GameServerQueryResult } from '../types'

const mockServers: DedicatedGameServer[] = [
  {
    id: 1,
    name: 'Server Alpha',
    gameTitle: 'Minecraft',
    serverType: 'minecraft',
    host: '192.168.1.10',
    port: 25565,
    status: 'offline',
    currentPlayers: 0,
    maxPlayers: 20,
    playerList: [],
    connectionAddress: '192.168.1.10:25565',
    ownerUsername: 'owner1',
    isOwner: true,
    userPermission: 'admin',
    isPublicLink: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

describe('useGameServersRefresh', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    queryClient.setQueryData(gameServersKeys.lists(), mockServers)
  })

  afterEach(() => {
    queryClient.clear()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('automatically probes and refreshes servers on mount from the user PC', async () => {
    const mockProbe: GameServerQueryResult = {
      status: 'online',
      pingMs: 18,
      currentPlayers: 4,
      maxPlayers: 20,
    }

    const probeSpy = vi
      .spyOn(serverProbeModule, 'probeServerFromClient')
      .mockResolvedValue(mockProbe)
    const refreshSpy = vi.spyOn(serverProbeModule, 'refreshGameServerStatus').mockResolvedValue({
      server: {
        ...mockServers[0],
        status: 'online',
        pingMs: 18,
        currentPlayers: 4,
      },
      fromClient: true,
    })

    const { result } = renderHook(() => useGameServersRefresh(mockServers, { intervalMs: 0 }), {
      wrapper,
    })

    await waitFor(() => {
      expect(probeSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
      expect(refreshSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
    })

    // Check query cache was updated with the new ping and status
    const cached = queryClient.getQueryData<DedicatedGameServer[]>(gameServersKeys.lists())
    expect(cached?.[0].status).toBe('online')
    expect(cached?.[0].pingMs).toBe(18)
    expect(result.current.lastRefreshedAt).not.toBeNull()
  })

  it('allows manual single server refresh', async () => {
    const refreshSpy = vi.spyOn(serverProbeModule, 'refreshGameServerStatus').mockResolvedValue({
      server: {
        ...mockServers[0],
        status: 'online',
        pingMs: 8,
      },
      fromClient: true,
    })

    const { result } = renderHook(() => useGameServersRefresh(mockServers, { intervalMs: 0 }), {
      wrapper,
    })

    await act(async () => {
      await result.current.refreshServer(1)
    })

    expect(refreshSpy).toHaveBeenCalledWith(mockServers[0], expect.any(Number))
    const cached = queryClient.getQueryData<DedicatedGameServer[]>(gameServersKeys.lists())
    expect(cached?.[0].pingMs).toBe(8)
  })
})
