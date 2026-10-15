import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type {
  NodeMapEdge,
  NodeMapItem,
  NodeMapPosition,
} from '../types/node-map'

const STORAGE_KEY = 'otix_node_map_positions_v1'

export const NODE_CARD_WIDTH = 340
export const NODE_CARD_HEIGHT = 220

export const buildNodeMapGraph = (
  homes: UserHome[],
  serverMachines: UserServerMachine[],
  nodes: GameServer[],
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

    if (machine.smbNodeIds && machine.smbNodeIds.length > 0) {
      for (const smbNodeId of machine.smbNodeIds) {
        // avoid duplicate if also hosted
        if (smbNodeId === machine.hostedNodeId) {
          continue
        }
        edges.push({
          id: `edge-server-${machine.id}-smb-node-${smbNodeId}`,
          sourceId: `server-${machine.id}`,
          sourceType: 'server',
          targetId: `node-${smbNodeId}`,
          targetType: 'node',
          relation: 'smb_link',
          label: `SMB /${machine.smbShareName || 'share'}`,
          detail: `Port ${machine.smbPort || 445}`,
        })
      }
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

  return { items, edges }
}

export const calculateAutoLayout = (
  items: NodeMapItem[],
  anchor?: { x: number; y: number },
): Record<string, NodeMapPosition> => {
  const positions: Record<string, NodeMapPosition> = {}

  const homes = items.filter((i) => i.type === 'home')
  const servers = items.filter((i) => i.type === 'server')
  const nodes = items.filter((i) => i.type === 'node')

  const startX = anchor?.x ?? 340
  const startY = anchor?.y ?? 240
  const columnWidth = 380
  const rowHeight = 240

  if (homes.length === 0 && servers.length === 0) {
    // Original nodes-only 2-column grid placement (identical to original cards view)
    nodes.forEach((node, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      positions[node.id] = {
        x: startX + col * columnWidth,
        y: startY + row * rowHeight,
      }
    })
  } else {
    // When homes or servers exist, organize in columns starting in the original section
    homes.forEach((home, index) => {
      positions[home.id] = {
        x: startX,
        y: startY + index * rowHeight,
      }
    })

    const serverX = homes.length > 0 ? startX + columnWidth : startX
    servers.forEach((server, index) => {
      positions[server.id] = {
        x: serverX,
        y: startY + index * rowHeight,
      }
    })

    const nodeX =
      homes.length > 0 && servers.length > 0
        ? startX + columnWidth * 2
        : homes.length > 0 || servers.length > 0
          ? startX + columnWidth
          : startX

    nodes.forEach((node, index) => {
      positions[node.id] = {
        x: nodeX,
        y: startY + index * rowHeight,
      }
    })
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

  // Home to Server or WorkerNode
  if (source.type === 'home' && (target.type === 'server' || target.type === 'node')) {
    return { compatible: true, connectionTypes: ['home'] }
  }
  if ((source.type === 'server' || source.type === 'node') && target.type === 'home') {
    return { compatible: true, connectionTypes: ['home'] }
  }

  // Server to WorkerNode (Hosted daemon or SMB share access)
  if (source.type === 'server' && target.type === 'node') {
    return { compatible: true, connectionTypes: ['host', 'smb'] }
  }
  if (source.type === 'node' && target.type === 'server') {
    return { compatible: true, connectionTypes: ['host', 'smb'] }
  }

  // Node to Node or Server to Server (Group under same Home environment)
  if (source.type === 'node' && target.type === 'node') {
    return { compatible: true, connectionTypes: ['home'] }
  }
  if (source.type === 'server' && target.type === 'server') {
    return { compatible: true, connectionTypes: ['home'] }
  }

  return {
    compatible: false,
    reason: `Cannot connect ${source.type} directly to ${target.type}`,
    connectionTypes: [],
  }
}
