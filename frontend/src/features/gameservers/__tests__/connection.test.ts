import { describe, it, expect } from 'vitest'
import { getSteamConnectionInfo } from '../utils/connection'
import type { DedicatedGameServer } from '../types'

describe('getSteamConnectionInfo', () => {
  it('builds steam run and browser URLs with password', () => {
    const server: DedicatedGameServer = {
      id: 1,
      name: 'Valheim World',
      gameTitle: 'Valheim',
      mediaItemId: null,
      serverType: 'steam_source',
      host: '192.168.1.100',
      port: 2456,
      queryPort: 2457,
      password: 'secret password',
      isPublicLink: true,
      status: 'online',
      currentPlayers: 2,
      maxPlayers: 10,
      playerList: ['Player1', 'Player2'],
      connectionAddress: '192.168.1.100:2456',
      ownerUsername: 'alice',
      isOwner: false,
      userPermission: 'viewer',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const info = getSteamConnectionInfo(server)
    expect(info.steamConnectAddress).toBe('192.168.1.100:2457')
    expect(info.steamBrowserUrl).toContain('steam://connect/192.168.1.100:2457')
    expect(info.steamBrowserUrl).toContain('secret%20password')
    // Valheim preset has steamAppId '892970'
    expect(String(info.steamAppId)).toBe('892970')
    expect(info.steamRunUrl).toContain('steam://run/892970//+connect%20192.168.1.100:2456%20+password%20secret%20password')
    expect(info.steamJoinUrl).toBe(info.steamRunUrl)
  })

  it('uses default port when queryPort is not explicitly set', () => {
    const server: DedicatedGameServer = {
      id: 2,
      name: 'Custom Server',
      gameTitle: 'Unknown Game',
      serverType: 'steam_source',
      host: '10.0.0.1',
      port: 27015,
      isPublicLink: true,
      status: 'online',
      currentPlayers: 0,
      maxPlayers: 16,
      playerList: [],
      connectionAddress: '10.0.0.1:27015',
      ownerUsername: 'bob',
      isOwner: true,
      userPermission: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    const info = getSteamConnectionInfo(server)
    expect(info.steamConnectAddress).toBe('10.0.0.1:27015')
    expect(info.steamAppId).toBeUndefined()
    expect(info.steamRunUrl).toBeNull()
    expect(info.steamJoinUrl).toBe(info.steamBrowserUrl)
  })
})
