import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  probeServerFromClient,
  applyProbeResultToGameServer,
  refreshGameServerStatus,
} from '../utils/server-probe'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import { gameServersApi } from '../api/gameservers-api'
import type { DedicatedGameServer, GameServerQueryResult } from '../types'

const mockServer: DedicatedGameServer = {
  id: 42,
  name: 'Test Palworld',
  gameTitle: 'Palworld',
  serverType: 'steam_source',
  host: '127.0.0.1',
  port: 8211,
  queryPort: 27015,
  isPublicLink: false,
  status: 'offline',
  currentPlayers: 0,
  maxPlayers: 32,
  playerList: [],
  connectionAddress: '127.0.0.1:8211',
  ownerUsername: 'testuser',
  isOwner: true,
  userPermission: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('server-probe utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopAPICache()
  })

  afterEach(() => {
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
    clearDesktopAPICache()
  })

  describe('probeServerFromClient', () => {
    it('returns null when window.desktopAPI is not available (browser context)', async () => {
      delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
      const result = await probeServerFromClient(mockServer)
      expect(result).toBeNull()
    })

    it('invokes desktopAPI.queryGameServer and returns accurate local ping and status', async () => {
      const mockResult: GameServerQueryResult = {
        status: 'online',
        pingMs: 14,
        currentPlayers: 5,
        maxPlayers: 32,
        currentMap: 'Palworld_Main',
        version: 'v0.2.2',
      }

      ;(window as unknown as { desktopAPI: unknown }).desktopAPI = {
        queryGameServer: vi.fn().mockResolvedValue(mockResult),
      }

      const result = await probeServerFromClient(mockServer)
      expect(result).toEqual(mockResult)
    })
  })

  describe('applyProbeResultToGameServer', () => {
    it('optimistically merges client probe metrics into server record', () => {
      const probe: GameServerQueryResult = {
        status: 'online',
        pingMs: 9,
        currentPlayers: 8,
        maxPlayers: 64,
        playerList: ['PlayerA', 'PlayerB'],
        currentMap: 'Survival Island',
        version: '1.20.4',
      }

      const updated = applyProbeResultToGameServer(mockServer, probe)
      expect(updated.status).toBe('online')
      expect(updated.pingMs).toBe(9)
      expect(updated.currentPlayers).toBe(8)
      expect(updated.maxPlayers).toBe(64)
      expect(updated.playerList).toEqual(['PlayerA', 'PlayerB'])
      expect(updated.currentMap).toBe('Survival Island')
      expect(updated.version).toBe('1.20.4')
      expect(updated.lastQueriedAt).toBeDefined()
    })
  })

  describe('refreshGameServerStatus', () => {
    it('probes from PC and synchronizes to backend when in desktop', async () => {
      const mockProbe: GameServerQueryResult = {
        status: 'online',
        pingMs: 11,
        currentPlayers: 3,
        maxPlayers: 20,
      }

      ;(window as unknown as { desktopAPI: unknown }).desktopAPI = {
        queryGameServer: vi.fn().mockResolvedValue(mockProbe),
      }

      const mockApiServer: DedicatedGameServer = {
        ...mockServer,
        status: 'online',
        pingMs: 11,
        currentPlayers: 3,
        maxPlayers: 20,
      }

      const querySpy = vi.spyOn(gameServersApi, 'query').mockResolvedValue({
        queryResult: mockProbe,
        server: mockApiServer,
      })

      const res = await refreshGameServerStatus(mockServer)
      expect(res.fromClient).toBe(true)
      expect(res.server.pingMs).toBe(11)
      expect(querySpy).toHaveBeenCalledWith(mockServer.id, mockProbe)
    })

    it('falls back to backend query when desktop bridge is not available', async () => {
      delete (window as unknown as { desktopAPI?: unknown }).desktopAPI

      const mockApiServer: DedicatedGameServer = {
        ...mockServer,
        status: 'online',
        pingMs: 45,
      }

      const querySpy = vi.spyOn(gameServersApi, 'query').mockResolvedValue({
        queryResult: null,
        server: mockApiServer,
      })

      const res = await refreshGameServerStatus(mockServer)
      expect(res.fromClient).toBe(false)
      expect(res.server.pingMs).toBe(45)
      expect(querySpy).toHaveBeenCalledWith(mockServer.id)
    })
  })
})
