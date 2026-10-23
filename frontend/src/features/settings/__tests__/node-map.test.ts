import { describe, it, expect } from 'vitest'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import {
  buildNodeMapGraph,
  calculateAutoLayout,
  calculateFitViewport,
  calculateZoomAtPoint,
  calculateWheelZoomDelta,
  isCompatibleConnection,
  computeTopologyStats,
  getNodeCardBorderAnchor,
  generateSmartNodeConnectionPath,
  getNodeCardWidth,
  getNodeCardHeight,
  getNodeCardDimensions,
  GAME_SERVER_CARD_WIDTH,
  GAME_SERVER_CARD_HEIGHT,
  NODE_CARD_WIDTH,
  NODE_CARD_HEIGHT,
  HUB_NODE_ID,
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

  it('inherits home environment from parent server machine when node has no direct homeId', () => {
    const unassignedNode: GameServer = {
      id: 200,
      name: 'Hosted Child Node',
      primaryUrl: 'http://192.168.1.60:8090',
      localUrl: 'http://192.168.1.60:8090',
      isOnline: true,
      isActive: true,
      totalFiles: 0,
      storageFreeBytes: 0,
      storageTotalBytes: 0,
      createdAt: '',
      updatedAt: '',
      homeId: undefined,
    }

    const parentMachine: UserServerMachine = {
      id: 20,
      name: 'Parent Server',
      homeId: 1,
      os: 'linux',
      hostedNodeId: 200,
      smbEnabled: false,
      createdAt: '',
      updatedAt: '',
    }

    const { items, edges } = buildNodeMapGraph(mockHomes, [parentMachine], [unassignedNode])
    const nodeItem = items.find((i) => i.id === 'node-200')
    expect(nodeItem?.homeId).toBe(1)
    expect(nodeItem?.homeName).toBe('Homelab')
    // Inherited child node inherits home metadata, but is NOT directly linked to home with an edge
    expect(edges.some((e) => e.relation === 'home_link' && e.targetId === 'node-200')).toBe(false)
    // Instead it is linked to its parent server machine via hosted_link
    expect(edges.some((e) => e.relation === 'hosted_link' && e.targetId === 'node-200')).toBe(true)
  })

  it('includes dedicated game servers and links to host server machine', () => {
    const mockGameServer: DedicatedGameServer = {
      id: 50,
      name: 'Minecraft SMP',
      gameTitle: 'Minecraft',
      serverType: 'minecraft',
      host: '192.168.1.50',
      port: 25565,
      serverMachineId: 10,
      isPublicLink: false,
      status: 'online',
      currentPlayers: 4,
      maxPlayers: 20,
      playerList: ['Alice', 'Bob'],
      connectionAddress: '192.168.1.50:25565',
      ownerUsername: 'alice',
      isOwner: true,
      userPermission: 'admin',
      createdAt: '',
      updatedAt: '',
    }

    const { items, edges } = buildNodeMapGraph(
      mockHomes,
      mockMachines,
      mockNodes,
      [],
      [],
      [mockGameServer],
    )

    const gsItem = items.find((i) => i.id === 'game-server-50')
    expect(gsItem).toBeDefined()
    expect(gsItem?.type).toBe('game_server')
    expect(gsItem?.name).toBe('Minecraft SMP')

    const hostEdge = edges.find(
      (e) => e.sourceId === 'server-10' && e.targetId === 'game-server-50',
    )
    expect(hostEdge).toBeDefined()
    expect(hostEdge?.relation).toBe('game_server_link')
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
    expect(positions['unclaimed-node-0'].x).toBe(420) // 2nd column in nodes grid (100 + 320)
    expect(positions[HUB_NODE_ID]).toBeDefined()
    expect(positions[HUB_NODE_ID].y).toBe(100)
  })

  it('calculates auto layout position for HUB_NODE_ID when items are empty', () => {
    const positions = calculateAutoLayout([], { x: 150, y: 80 })
    expect(positions[HUB_NODE_ID]).toBeDefined()
    expect(positions[HUB_NODE_ID].x).toBeDefined()
    expect(positions[HUB_NODE_ID].y).toBe(80)
  })
})

describe('calculateZoomAtPoint', () => {
  it('zooms into target point keeping coordinate under cursor stationary', () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    // Mouse at (400, 300), zoom from 1.0 to 2.0
    const nextVp = calculateZoomAtPoint(vp, 2.0, 400, 300)
    expect(nextVp.zoom).toBe(2)
    // Canvas coordinate before: (400 - 0)/1 = 400, (300 - 0)/1 = 300
    // Canvas coordinate after: (400 - nextVp.x)/nextVp.zoom should equal 400
    const canvasXAfter = (400 - nextVp.x) / nextVp.zoom
    const canvasYAfter = (300 - nextVp.y) / nextVp.zoom
    expect(canvasXAfter).toBeCloseTo(400)
    expect(canvasYAfter).toBeCloseTo(300)
  })

  it('clamps zoom within bounds', () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    const zoomedIn = calculateZoomAtPoint(vp, 5.0, 100, 100, 0.35, 2.5)
    expect(zoomedIn.zoom).toBe(2.5)
    const zoomedOut = calculateZoomAtPoint(vp, 0.1, 100, 100, 0.35, 2.5)
    expect(zoomedOut.zoom).toBe(0.35)
  })
})

describe('calculateWheelZoomDelta', () => {
  it('returns discrete wheel steps for mouse wheel', () => {
    expect(calculateWheelZoomDelta(-100, false, 0)).toBe(0.12)
    expect(calculateWheelZoomDelta(100, false, 0)).toBe(-0.12)
  })

  it('returns smooth continuous steps for pinch or trackpad', () => {
    expect(calculateWheelZoomDelta(-10, true, 0)).toBe(0.1)
    expect(calculateWheelZoomDelta(10, false, 0)).toBeCloseTo(-0.03)
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

  it('allows connecting Dedicated Game Server to Server Machine, but not to Home or another Game Server', () => {
    const gsItem = {
      id: 'game-server-1',
      type: 'game_server' as const,
      entityId: 1,
      name: 'Palworld Server',
      data: { type: 'game_server' as const, gameServer: {} as DedicatedGameServer },
    }
    const serverItem = {
      id: 'server-10',
      type: 'server' as const,
      entityId: 10,
      name: 'Server Machine',
      data: { type: 'server' as const, machine: {} as UserServerMachine },
    }
    const homeItem = {
      id: 'home-1',
      type: 'home' as const,
      entityId: 1,
      name: 'Home Environment',
      data: { type: 'home' as const, home: {} as UserHome },
    }

    const gsToServer = isCompatibleConnection(gsItem, serverItem)
    expect(gsToServer.compatible).toBe(true)
    expect(gsToServer.connectionTypes).toContain('host')

    const gsToHome = isCompatibleConnection(gsItem, homeItem)
    expect(gsToHome.compatible).toBe(false)
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

    const gameServers: DedicatedGameServer[] = [
      { id: 1, name: 'Palworld', currentPlayers: 3 } as DedicatedGameServer,
      { id: 2, name: 'Valheim', currentPlayers: 5 } as DedicatedGameServer,
    ]
    const statsWithGs = computeTopologyStats(nodes, [], [], pendingNodes, [], gameServers)
    expect(statsWithGs.gameServerCount).toBe(2)
    expect(statsWithGs.gameServerPlayerCount).toBe(8)
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

  it('allows connecting Samba Share to Server Machine and Worker Node, but disallows connecting Samba to Home', () => {
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
    const nodeItem = {
      id: 'node-100',
      type: 'node' as const,
      entityId: 100,
      name: 'Worker Node',
      data: { type: 'node' as const, server: {} as GameServer },
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

    const smbToNode = isCompatibleConnection(sambaItem, nodeItem)
    expect(smbToNode.compatible).toBe(true)
    expect(smbToNode.connectionTypes).toContain('smb')

    const serverToNode = isCompatibleConnection(serverItem, nodeItem)
    expect(serverToNode.compatible).toBe(true)
    expect(serverToNode.connectionTypes).toContain('host')
    expect(serverToNode.connectionTypes).toContain('smb')

    const smbToHome = isCompatibleConnection(sambaItem, homeItem)
    expect(smbToHome.compatible).toBe(false)
    expect(smbToHome.reason).toContain('Samba shares can only be connected to a Server Machine or Worker Node')
  })

  it('builds smb_link edges connecting Samba share to worker nodes when smbNodeIds are defined', () => {
    const server: UserServerMachine = {
      id: 20,
      name: 'Unraid NAS',
      homeId: 1,
      smbEnabled: true,
      smbShareName: 'games',
      smbNodeIds: [100],
      createdAt: '',
      updatedAt: '',
    }
    const node: GameServer = {
      id: 100,
      name: 'Worker Node',
      primaryUrl: 'http://localhost:8090',
      isOnline: true,
      isActive: true,
      totalFiles: 0,
      storageFreeBytes: 0,
      storageTotalBytes: 0,
      createdAt: '',
      updatedAt: '',
    }

    const { edges } = buildNodeMapGraph([], [server], [node])
    const smbEdge = edges.find((e) => e.relation === 'smb_link')
    expect(smbEdge).toBeDefined()
    expect(smbEdge?.sourceId).toBe('samba-server-20')
    expect(smbEdge?.targetId).toBe('node-100')
    expect(smbEdge?.label).toBe('SMB Access')
  })

  it('builds smb_link edges for standalone Samba shares with nodeIds', () => {
    const customSamba = {
      id: 'samba-custom-99',
      shareName: 'nas_games',
      port: 445,
      nodeIds: [200],
    }
    const node: GameServer = {
      id: 200,
      name: 'Secondary Worker',
      primaryUrl: 'http://localhost:8091',
      isOnline: true,
      isActive: true,
      totalFiles: 0,
      storageFreeBytes: 0,
      storageTotalBytes: 0,
      createdAt: '',
      updatedAt: '',
    }

    const { edges } = buildNodeMapGraph([], [], [node], [], [customSamba])
    const smbEdge = edges.find((e) => e.relation === 'smb_link')
    expect(smbEdge).toBeDefined()
    expect(smbEdge?.sourceId).toBe('samba-custom-99')
    expect(smbEdge?.targetId).toBe('node-200')
  })
})

describe('calculateFitViewport', () => {
  it('computes a centered viewport and zoom factor covering all items', () => {
    const items = [
      { id: 'item-1', type: 'node' as const, entityId: 1, name: '1', data: {} as any },
      { id: 'item-2', type: 'node' as const, entityId: 2, name: '2', data: {} as any },
    ]
    const positions = {
      'item-1': { x: 100, y: 100 },
      'item-2': { x: 500, y: 300 },
    }

    const vp = calculateFitViewport(items, positions, 1200, 800)
    expect(vp.zoom).toBeGreaterThan(0)
    expect(vp.zoom).toBeLessThanOrEqual(1.2)
    expect(typeof vp.x).toBe('number')
    expect(typeof vp.y).toBe('number')
  })

  it('returns default viewport when items array is empty', () => {
    const vp = calculateFitViewport([], {}, 1200, 800)
    expect(vp).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})

describe('getNodeCardBorderAnchor', () => {
  const p1 = { x: 100, y: 100 }

  it('anchors to the middle of the right border when target is to the right', () => {
    const target = { x: 400, y: 100 }
    const anchor = getNodeCardBorderAnchor(p1, target, true)
    expect(anchor.side).toBe('right')
    expect(anchor.point.x).toBe(340) // 100 + 240
    expect(anchor.point.y).toBe(124) // 100 + 48/2
  })

  it('anchors to the middle of the left border when target is to the left', () => {
    const target = { x: -200, y: 100 }
    const anchor = getNodeCardBorderAnchor(p1, target, true)
    expect(anchor.side).toBe('left')
    expect(anchor.point.x).toBe(100)
    expect(anchor.point.y).toBe(124)
  })

  it('anchors to the middle of the bottom border when target is below', () => {
    const target = { x: 100, y: 300 }
    const anchor = getNodeCardBorderAnchor(p1, target, true)
    expect(anchor.side).toBe('bottom')
    expect(anchor.point.x).toBe(220) // 100 + 240/2
    expect(anchor.point.y).toBe(148) // 100 + 48
  })

  it('anchors to the middle of the top border when target is above', () => {
    const target = { x: 100, y: -100 }
    const anchor = getNodeCardBorderAnchor(p1, target, true)
    expect(anchor.side).toBe('top')
    expect(anchor.point.x).toBe(220)
    expect(anchor.point.y).toBe(100)
  })

  it('slides along the border when target is at an angle', () => {
    const target = { x: 300, y: 220 }
    const anchor = getNodeCardBorderAnchor(p1, target, true)
    expect(['bottom', 'right']).toContain(anchor.side)
    // Anchor remains within valid card border bounds
    expect(anchor.point.x).toBeGreaterThanOrEqual(100)
    expect(anchor.point.x).toBeLessThanOrEqual(340)
    expect(anchor.point.y).toBeGreaterThanOrEqual(100)
    expect(anchor.point.y).toBeLessThanOrEqual(148)
  })
})

describe('generateSmartNodeConnectionPath', () => {
  it('generates a smooth path and accurate midpoint between two anchors', () => {
    const p1 = { x: 340, y: 124 }
    const p2 = { x: 500, y: 124 }
    const res = generateSmartNodeConnectionPath(p1, 'right', p2, 'left')

    expect(res.path).toContain('M 340 124 C')
    expect(res.mid.x).toBeCloseTo(420, 0)
    expect(res.mid.y).toBeCloseTo(124, 0)
  })

  it('supports vertical bottom-to-top curves', () => {
    const p1 = { x: 220, y: 148 }
    const p2 = { x: 220, y: 300 }
    const res = generateSmartNodeConnectionPath(p1, 'bottom', p2, 'top')

    expect(res.path).toContain('M 220 148 C')
    expect(res.mid.x).toBeCloseTo(220, 0)
    expect(res.mid.y).toBeCloseTo(224, 0)
  })
})

describe('getNodeCardDimensions', () => {
  it('returns standard dimensions for non-game-server node types', () => {
    expect(getNodeCardWidth('home')).toBe(NODE_CARD_WIDTH)
    expect(getNodeCardHeight('home')).toBe(NODE_CARD_HEIGHT)
    expect(getNodeCardDimensions('server')).toEqual({ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT })
    expect(getNodeCardDimensions('node')).toEqual({ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT })
    expect(getNodeCardDimensions('samba')).toEqual({ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT })
    expect(getNodeCardDimensions('unclaimed_node')).toEqual({ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT })
    expect(getNodeCardDimensions(undefined)).toEqual({ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT })
  })

  it('returns dedicated dimensions for game_server node type', () => {
    expect(getNodeCardWidth('game_server')).toBe(GAME_SERVER_CARD_WIDTH)
    expect(getNodeCardHeight('game_server')).toBe(GAME_SERVER_CARD_HEIGHT)
    expect(getNodeCardDimensions('game_server')).toEqual({
      width: GAME_SERVER_CARD_WIDTH,
      height: GAME_SERVER_CARD_HEIGHT,
    })
  })
})

