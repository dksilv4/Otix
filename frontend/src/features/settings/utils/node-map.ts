import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { nodeUrlKey } from '@/features/downloads/pending-nodes'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type {
  NodeMapEdge,
  NodeMapItem,
  NodeMapPosition,
  SambaShareConfig,
} from '../types/node-map'

const STORAGE_KEY = 'otix_node_map_positions_v1'

export const NODE_CARD_WIDTH = 340
export const NODE_CARD_HEIGHT = 220

export const buildNodeMapGraph = (
  homes: UserHome[],
  serverMachines: UserServerMachine[],
  nodes: GameServer[],
  pendingNodes: PendingNode[] = [],
  customSambaShares: SambaShareConfig[] = [],
): { items: NodeMapItem[]; edges: NodeMapEdge[] } => {
  const items: NodeMapItem[] = []
  const edges: NodeMapEdge[] = []

  const homesMap = new Map<number, UserHome>()
  for (const home of homes) {
    homesMap.set(home.id, home)
    items.push({
      id: `home-${home.id}`,
      type: 'home',
      entityId: home.id,
      name: home.name,
      data: { type: 'home', home },
    })
  }

  for (const machine of serverMachines) {
    const homeName = machine.homeId ? homesMap.get(machine.homeId)?.name : null
    items.push({
      id: `server-${machine.id}`,
      type: 'server',
      entityId: machine.id,
      name: machine.name,
      homeId: machine.homeId,
      homeName,
      data: { type: 'server', machine },
    })

    if (machine.homeId && homesMap.has(machine.homeId)) {
      edges.push({
        id: `edge-home-${machine.homeId}-server-${machine.id}`,
        sourceId: `home-${machine.homeId}`,
        sourceType: 'home',
        targetId: `server-${machine.id}`,
        targetType: 'server',
        relation: 'home_link',
        label: 'Home Member',
      })
    }

    if (machine.hostedNodeId) {
      edges.push({
        id: `edge-server-${machine.id}-host-node-${machine.hostedNodeId}`,
        sourceId: `server-${machine.id}`,
        sourceType: 'server',
        targetId: `node-${machine.hostedNodeId}`,
        targetType: 'node',
        relation: 'hosted_link',
        label: 'Hosts Node',
        detail: machine.name,
      })
    }

    // If server has SMB share enabled, render a dedicated Samba Share node connected to this server
    if (machine.smbEnabled) {
      const sambaId = `samba-server-${machine.id}`
      items.push({
        id: sambaId,
        type: 'samba',
        entityId: `smb-${machine.id}`,
        name: machine.smbShareName ? `/${machine.smbShareName}` : 'Samba Share',
        data: {
          type: 'samba',
          samba: {
            id: sambaId,
            serverId: machine.id,
            serverName: machine.name,
            shareName: machine.smbShareName || 'share',
            host: machine.smbHost || machine.host || '',
            port: machine.smbPort || 445,
            username: machine.smbUsername || '',
            password: machine.smbPassword || '',
            workgroup: machine.smbWorkgroup || 'WORKGROUP',
            mountPath: machine.smbMountPath || '',
            isOnline: machine.isOnline,
          },
        },
      })

      edges.push({
        id: `edge-server-${machine.id}-samba-${machine.id}`,
        sourceId: `server-${machine.id}`,
        sourceType: 'server',
        targetId: sambaId,
        targetType: 'samba',
        relation: 'samba_server_link',
        label: `SMB /${machine.smbShareName || 'share'}`,
        detail: `Port ${machine.smbPort || 445}`,
      })
    }
  }

  for (const node of nodes) {
    const homeName = node.homeName || (node.homeId ? homesMap.get(node.homeId)?.name : null)
    items.push({
      id: `node-${node.id}`,
      type: 'node',
      entityId: node.id,
      name: node.name,
      homeId: node.homeId,
      homeName,
      data: { type: 'node', server: node },
    })

    if (node.homeId && homesMap.has(node.homeId)) {
      edges.push({
        id: `edge-home-${node.homeId}-node-${node.id}`,
        sourceId: `home-${node.homeId}`,
        sourceType: 'home',
        targetId: `node-${node.id}`,
        targetType: 'node',
        relation: 'home_link',
        label: 'Home Member',
      })
    }
  }

  // Include custom standalone Samba shares (not yet connected to a server or created manually)
  for (const samba of customSambaShares) {
    if (samba.serverId && serverMachines.some((m) => m.id === samba.serverId && m.smbEnabled)) {
      continue
    }
    items.push({
      id: samba.id,
      type: 'samba',
      entityId: samba.id,
      name: samba.shareName ? `/${samba.shareName}` : 'Samba Share',
      data: { type: 'samba', samba },
    })

    if (samba.serverId && serverMachines.some((m) => m.id === samba.serverId)) {
      edges.push({
        id: `edge-server-${samba.serverId}-${samba.id}`,
        sourceId: `server-${samba.serverId}`,
        sourceType: 'server',
        targetId: samba.id,
        targetType: 'samba',
        relation: 'samba_server_link',
        label: `SMB /${samba.shareName}`,
        detail: `Port ${samba.port || 445}`,
      })
    }
  }

  // Include unclaimed/pending Otix nodes so they appear on the topology map
  const unclaimed = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !nodes.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )

  for (let i = 0; i < unclaimed.length; i++) {
    const pending = unclaimed[i]
    items.push({
      id: `unclaimed-node-${i}-${nodeUrlKey(pending.localUrl || 'local')}`,
      type: 'unclaimed_node',
      entityId: -(i + 100),
      name: pending.serverName || 'Otix Node',
      data: { type: 'unclaimed_node', pending },
    })
  }

  return { items, edges }
}

export const calculateAutoLayout = (
  items: NodeMapItem[],
  anchor?: { x: number; y: number },
): Record<string, NodeMapPosition> => {
  const positions: Record<string, NodeMapPosition> = {}

  const homes = items.filter((i) => i.type === 'home')
  const servers = items.filter((i) => i.type === 'server')
  const sambas = items.filter((i) => i.type === 'samba')
  const nodes = items.filter((i) => i.type === 'node')
  const unclaimed = items.filter((i) => i.type === 'unclaimed_node')
  const allNodes = [...nodes, ...unclaimed]

  const startX = anchor?.x ?? 340
  const startY = anchor?.y ?? 240
  const columnWidth = 380
  const rowHeight = 240

  let currentColumn = 0

  if (homes.length > 0) {
    const colX = startX + currentColumn * columnWidth
    homes.forEach((home, index) => {
      positions[home.id] = { x: colX, y: startY + index * rowHeight }
    })
    currentColumn++
  }

  if (servers.length > 0) {
    const colX = startX + currentColumn * columnWidth
    servers.forEach((server, index) => {
      positions[server.id] = { x: colX, y: startY + index * rowHeight }
    })
    currentColumn++
  }

  if (sambas.length > 0) {
    const colX = startX + currentColumn * columnWidth
    sambas.forEach((samba, index) => {
      positions[samba.id] = { x: colX, y: startY + index * rowHeight }
    })
    currentColumn++
  }

  if (allNodes.length > 0) {
    if (currentColumn === 0) {
      // 2-column grid for nodes only
      allNodes.forEach((node, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        positions[node.id] = {
          x: startX + col * columnWidth,
          y: startY + row * rowHeight,
        }
      })
    } else {
      const colX = startX + currentColumn * columnWidth
      allNodes.forEach((node, index) => {
        positions[node.id] = { x: colX, y: startY + index * rowHeight }
      })
    }
  }

  return positions
}

export const loadStoredPositions = (): Record<string, NodeMapPosition> => {
  try {
    if (typeof window === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch {
    // ignore
  }
  return {}
}

export const saveStoredPositions = (positions: Record<string, NodeMapPosition>): void => {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // ignore
  }
}

const SAMBA_STORAGE_KEY = 'otix_custom_samba_shares_v1'

export const loadStoredSambaShares = (): SambaShareConfig[] => {
  try {
    if (typeof window === 'undefined') return []
    const raw = localStorage.getItem(SAMBA_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore
  }
  return []
}

export const saveStoredSambaShares = (shares: SambaShareConfig[]): void => {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(SAMBA_STORAGE_KEY, JSON.stringify(shares))
  } catch {
    // ignore
  }
}

export const generateSmoothBezierPath = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  curvature = 0.5,
): string => {
  const dx = Math.max(Math.abs(p2.x - p1.x) * curvature, 60)
  return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`
}

export const getEdgeCenterPoint = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): { x: number; y: number } => {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  }
}

export const isCompatibleConnection = (
  source: NodeMapItem,
  target: NodeMapItem,
): { compatible: boolean; reason?: string; connectionTypes: Array<'home' | 'host' | 'smb'> } => {
  if (source.id === target.id) {
    return { compatible: false, reason: 'Cannot connect a node to itself', connectionTypes: [] }
  }

  // Unclaimed nodes must be claimed before connecting
  if (source.type === 'unclaimed_node' || target.type === 'unclaimed_node') {
    return {
      compatible: false,
      reason: 'Claim this Otix Node first to enable network and home connections.',
      connectionTypes: [],
    }
  }

  // Samba Share to Server Machine
  if (
    (source.type === 'samba' && target.type === 'server') ||
    (source.type === 'server' && target.type === 'samba')
  ) {
    return { compatible: true, connectionTypes: ['smb'] }
  }

  // Home to Server or WorkerNode (Otix Node)
  if (source.type === 'home' && (target.type === 'server' || target.type === 'node')) {
    return { compatible: true, connectionTypes: ['home'] }
  }
  if ((source.type === 'server' || source.type === 'node') && target.type === 'home') {
    return { compatible: true, connectionTypes: ['home'] }
  }

  // Server to WorkerNode (Hosted daemon)
  if (source.type === 'server' && target.type === 'node') {
    return { compatible: true, connectionTypes: ['host'] }
  }
  if (source.type === 'node' && target.type === 'server') {
    return { compatible: true, connectionTypes: ['host'] }
  }

  // Node to Node or Server to Server (Group under same Home environment)
  if (source.type === 'node' && target.type === 'node') {
    return { compatible: true, connectionTypes: ['home'] }
  }
  if (source.type === 'server' && target.type === 'server') {
    return { compatible: true, connectionTypes: ['home'] }
  }

  if (source.type === 'samba' || target.type === 'samba') {
    return {
      compatible: false,
      reason: 'Samba shares can only be connected to a Server Machine.',
      connectionTypes: [],
    }
  }

  return {
    compatible: false,
    reason: `Cannot connect ${source.type} directly to ${target.type}`,
    connectionTypes: [],
  }
}

export interface TopologyStats {
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  unclaimedNodes: number
  serverCount: number
  homeCount: number
  sambaCount: number
}

export const computeTopologyStats = (
  nodes: GameServer[],
  serverMachines: UserServerMachine[],
  homes: UserHome[],
  pendingNodes: PendingNode[] = [],
  customSambaShares: SambaShareConfig[] = [],
): TopologyStats => {
  const unclaimed = pendingNodes.filter(
    (p) =>
      !p.claimed &&
      Boolean(p.claimCode || p.localUrl) &&
      !nodes.some((s) => s.localUrl === p.localUrl || s.primaryUrl === p.localUrl),
  )
  const totalNodes = nodes.length
  const onlineNodes = nodes.filter((n) => n.isOnline).length
  const offlineNodes = totalNodes - onlineNodes
  const smbServerCount = serverMachines.filter((m) => m.smbEnabled).length
  const sambaCount = smbServerCount + customSambaShares.length

  return {
    totalNodes,
    onlineNodes,
    offlineNodes,
    unclaimedNodes: unclaimed.length,
    serverCount: serverMachines.length,
    homeCount: homes.length,
    sambaCount,
  }
}

export const findOrphanedNodeMatch = (
  server: GameServer,
  pendingNodes: PendingNode[],
): PendingNode | undefined => {
  if (!pendingNodes.length) return undefined
  const serverUrls = [server.primaryUrl, server.localUrl].filter(Boolean) as string[]
  const keys = new Set(serverUrls.map(nodeUrlKey))
  return pendingNodes.find((p) => {
    if (!p.localUrl) return false
    const k = nodeUrlKey(p.localUrl)
    return keys.has(k) || (p.authToken && server.authToken && p.authToken !== server.authToken)
  })
}

