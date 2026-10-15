import { describe, it, expect } from 'vitest'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import {
  buildNodeMapGraph,
  calculateAutoLayout,
  isCompatibleConnection,
  computeTopologyStats,
} from '../utils/node-map'

describe('buildNodeMapGraph', () => {
  const mockHomes: UserHome[] = [
    {
      id: 1,
      name: 'Homelab',
      isDefault: true,
      subnetCidr: '192.168.1.0/24',
      serverMachinesCount: 1,
      nodesCount: 1,
      createdAt: '',
      updatedAt: '',
    },
  ]

  const mockMachines: UserServerMachine[] = [
    {
      id: 10,
      name: 'Main Server',
      homeId: 1,
      os: 'linux',
      hostedNodeId: 100,
      smbEnabled: true,
      smbNodeIds: [100],
      createdAt: '',
      updatedAt: '',
    },
  ]

  const mockNodes: GameServer[] = [
    {
      id: 100,
      name: 'Worker 1',
      primaryUrl: 'http://192.168.1.50:8090',
      localUrl: 'http://192.168.1.50:8090',
      isOnline: true,
      isActive: true,
      totalFiles: 0,
      storageFreeBytes: 0,
      storageTotalBytes: 0,
      createdAt: '',
      updatedAt: '',
      homeId: 1,
    },
  ]

  it('builds items and edges from homes, servers, and nodes', () => {
    const { items, edges } = buildNodeMapGraph(mockHomes, mockMachines, mockNodes)

    expect(items.some((i) => i.id === 'home-1')).toBe(true)
    expect(items.some((i) => i.id === 'server-10')).toBe(true)
    expect(items.some((i) => i.id === 'node-100')).toBe(true)
    expect(edges.some((e) => e.relation === 'home_link')).toBe(true)
    expect(edges.some((e) => e.relation === 'hosted_link')).toBe(true)
  })

  it('includes discovered/unclaimed Otix nodes on the canvas map', () => {
    const pendingNodes: PendingNode[] = [
      {
        serverName: 'Otix Node Local',
        localUrl: 'http://127.0.0.1:8090',
        claimCode: '849201',
        claimed: false,
      },
    ]

    const { items } = buildNodeMapGraph(mockHomes, mockMachines, mockNodes, pendingNodes)

    const unclaimedItem = items.find((i) => i.type === 'unclaimed_node')
    expect(unclaimedItem).toBeDefined()
    expect(unclaimedItem?.name).toBe('Otix Node Local')
    if (unclaimedItem?.data.type === 'unclaimed_node') {
      expect(unclaimedItem.data.pending.claimCode).toBe('849201')
    }
  })

  it('filters out pending nodes that are already claimed or match existing servers', () => {
    const pendingNodes: PendingNode[] = [
      {
        serverName: 'Worker 1',
        localUrl: 'http://192.168.1.50:8090',
        claimed: true,
      },
    ]

    const { items } = buildNodeMapGraph(mockHomes, mockMachines, mockNodes, pendingNodes)
    expect(items.filter((i) => i.type === 'unclaimed_node')).toHaveLength(0)
  })
})

describe('calculateAutoLayout', () => {
  it('positions unclaimed nodes alongside worker nodes', () => {
    const items = [
      {
        id: 'node-1',
        type: 'node' as const,
        entityId: 1,
        name: 'Node 1',
        data: { type: 'node' as const, server: {} as GameServer },
      },
      {
        id: 'unclaimed-node-0',
        type: 'unclaimed_node' as const,
        entityId: -100,
        name: 'Otix Node',
        data: { type: 'unclaimed_node' as const, pending: {} as PendingNode },
      },
    ]

    const positions = calculateAutoLayout(items, { x: 100, y: 100 })
    expect(positions['node-1']).toBeDefined()
    expect(positions['unclaimed-node-0']).toBeDefined()
    expect(positions['node-1'].x).toBe(100)
    expect(positions['unclaimed-node-0'].x).toBe(480) // 2nd column in nodes grid
  })
})

describe('isCompatibleConnection', () => {
  it('prevents connecting unclaimed nodes before claiming', () => {
    const unclaimedItem = {
      id: 'unclaimed-1',
      type: 'unclaimed_node' as const,
      entityId: -100,
      name: 'Otix Node',
      data: { type: 'unclaimed_node' as const, pending: {} as PendingNode },
    }
    const homeItem = {
      id: 'home-1',
      type: 'home' as const,
      entityId: 1,
      name: 'Homelab',
      data: { type: 'home' as const, home: {} as UserHome },
    }

    const check = isCompatibleConnection(unclaimedItem, homeItem)
    expect(check.compatible).toBe(false)
    expect(check.reason).toContain('Claim this Otix Node first')
  })
})

describe('computeTopologyStats', () => {
  it('counts active, offline, and unclaimed nodes accurately', () => {
    const nodes: GameServer[] = [
      { id: 1, name: 'Online Node', isOnline: true } as GameServer,
      { id: 2, name: 'Offline Node', isOnline: false } as GameServer,
    ]
    const pendingNodes: PendingNode[] = [
      { serverName: 'Otix Node', localUrl: 'http://127.0.0.1:8090', claimCode: '123456', claimed: false },
    ]

    const stats = computeTopologyStats(nodes, [], [], pendingNodes)
    expect(stats.totalNodes).toBe(2)
    expect(stats.onlineNodes).toBe(1)
    expect(stats.offlineNodes).toBe(1)
    expect(stats.unclaimedNodes).toBe(1)
  })
})

describe('Samba Share Topology & Connections', () => {
  it('creates dedicated Samba Share node from smbEnabled server machine', () => {
    const server: UserServerMachine = {
      id: 20,
      name: 'Unraid NAS',
      homeId: 1,
      smbEnabled: true,
      smbShareName: 'games_share',
      smbHost: '192.168.1.20',
      smbPort: 445,
      createdAt: '',
      updatedAt: '',
    }
    const { items, edges } = buildNodeMapGraph([], [server], [])

    const sambaItem = items.find((i) => i.type === 'samba')
    expect(sambaItem).toBeDefined()
    expect(sambaItem?.name).toBe('/games_share')
    expect(edges.some((e) => e.relation === 'samba_server_link')).toBe(true)
  })

  it('allows connecting Samba Share to Server Machine and disallows connecting Samba to Home', () => {
    const sambaItem = {
      id: 'samba-custom-1',
      type: 'samba' as const,
      entityId: 'samba-custom-1',
      name: 'Games',
      data: { type: 'samba' as const, samba: { id: 'samba-custom-1', shareName: 'Games' } },
    }
    const serverItem = {
      id: 'server-10',
      type: 'server' as const,
      entityId: 10,
      name: 'Server',
      data: { type: 'server' as const, machine: {} as UserServerMachine },
    }
    const homeItem = {
      id: 'home-1',
      type: 'home' as const,
      entityId: 1,
      name: 'Homelab',
      data: { type: 'home' as const, home: {} as UserHome },
    }

    const smbToServer = isCompatibleConnection(sambaItem, serverItem)
    expect(smbToServer.compatible).toBe(true)
    expect(smbToServer.connectionTypes).toContain('smb')

    const smbToHome = isCompatibleConnection(sambaItem, homeItem)
    expect(smbToHome.compatible).toBe(false)
    expect(smbToHome.reason).toContain('Samba shares can only be connected to a Server Machine')
  })
})
