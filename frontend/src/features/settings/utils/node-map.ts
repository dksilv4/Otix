import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { nodeUrlKey } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type {
  NodeMapEdge,
  NodeMapItem,
  NodeMapItemType,
  NodeMapPosition,
  NodeMapViewport,
  SambaShareConfig,
} from '../types/node-map'

const STORAGE_KEY = 'otix_node_map_positions_v1'

export const NODE_CARD_WIDTH = 240
export const NODE_CARD_HEIGHT = 48
export const GAME_SERVER_CARD_WIDTH = 270
export const GAME_SERVER_CARD_HEIGHT = 78
export const HUB_NODE_ID = 'central-hub-node'
export const HUB_NODE_WIDTH = 540
export const HUB_NODE_HEIGHT = 180

export const getNodeCardWidth = (type?: NodeMapItemType): number => {
  return type === 'game_server' ? GAME_SERVER_CARD_WIDTH : NODE_CARD_WIDTH
}

export const getNodeCardHeight = (type?: NodeMapItemType): number => {
  return type === 'game_server' ? GAME_SERVER_CARD_HEIGHT : NODE_CARD_HEIGHT
}

export const getNodeCardDimensions = (type?: NodeMapItemType): { width: number; height: number } => ({
  width: getNodeCardWidth(type),
  height: getNodeCardHeight(type),
})

export const buildNodeMapGraph = (
  homes: UserHome[],
  serverMachines: UserServerMachine[],
  nodes: GameServer[],
  pendingNodes: PendingNode[] = [],
  customSambaShares: SambaShareConfig[] = [],
  gameServers: DedicatedGameServer[] = [],
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

    // Collect all SMB shares configured on this server machine:
    // 1. From machine.smbShares
    // 2. From machine.smbShareName (if enabled)
    // 3. From customSambaShares matching this machine.id
    const serverSambaShares: SambaShareConfig[] = []
    const seenShareKeys = new Set<string>()

    if (machine.smbShares && Array.isArray(machine.smbShares)) {
      for (const sh of machine.smbShares) {
        if (!sh || !sh.shareName) continue
        const key = sh.shareName.toLowerCase()
        if (!seenShareKeys.has(key)) {
          seenShareKeys.add(key)
          serverSambaShares.push({
            id: sh.id || `samba-server-${machine.id}-${sh.shareName}`,
            serverId: machine.id,
            serverName: machine.name,
            shareName: sh.shareName,
            host: sh.host || machine.smbHost || machine.host || '',
            port: sh.port || machine.smbPort || 445,
            username: sh.username ?? machine.smbUsername ?? '',
            password: sh.password ?? machine.smbPassword ?? '',
            workgroup: sh.workgroup || machine.smbWorkgroup || 'WORKGROUP',
            mountPath: sh.mountPath || machine.smbMountPath || '',
            isOnline: machine.isOnline,
            nodeIds: sh.nodeIds || machine.smbNodeIds || [],
          })
        }
      }
    }

    if (machine.smbEnabled && machine.smbShareName) {
      const key = machine.smbShareName.toLowerCase()
      if (!seenShareKeys.has(key)) {
        seenShareKeys.add(key)
        serverSambaShares.unshift({
          id: `samba-server-${machine.id}`,
          serverId: machine.id,
          serverName: machine.name,
          shareName: machine.smbShareName,
          host: machine.smbHost || machine.host || '',
          port: machine.smbPort || 445,
          username: machine.smbUsername || '',
          password: machine.smbPassword || '',
          workgroup: machine.smbWorkgroup || 'WORKGROUP',
          mountPath: machine.smbMountPath || '',
          isOnline: machine.isOnline,
          nodeIds: machine.smbNodeIds || [],
        })
      }
    }

    for (const sh of customSambaShares) {
      if (sh.serverId === machine.id && sh.shareName) {
        const key = sh.shareName.toLowerCase()
        if (!seenShareKeys.has(key)) {
          seenShareKeys.add(key)
          serverSambaShares.push({
            ...sh,
            id: sh.id || `samba-custom-${machine.id}-${sh.shareName}`,
            serverId: machine.id,
            serverName: machine.name,
            isOnline: machine.isOnline,
          })
        }
      }
    }

    if (serverSambaShares.length > 0) {
      for (const share of serverSambaShares) {
        items.push({
          id: share.id,
          type: 'samba',
          entityId: share.id,
          name: share.shareName ? `/${share.shareName}` : 'Samba Share',
          data: {
            type: 'samba',
            samba: share,
          },
        })

        edges.push({
          id: `edge-server-${machine.id}-samba-${share.id}`,
          sourceId: `server-${machine.id}`,
          sourceType: 'server',
          targetId: share.id,
          targetType: 'samba',
          relation: 'samba_server_link',
          label: `SMB /${share.shareName || 'share'}`,
          detail: `Port ${share.port || 445}`,
        })

        const accessNodeIds = share.nodeIds?.length ? share.nodeIds : machine.smbNodeIds || []
        for (const nodeId of accessNodeIds) {
          if (nodes.some((n) => n.id === nodeId)) {
            edges.push({
              id: `edge-smb-server-${machine.id}-share-${share.id}-node-${nodeId}`,
              sourceId: share.id,
              sourceType: 'samba',
              targetId: `node-${nodeId}`,
              targetType: 'node',
              relation: 'smb_link',
              label: 'SMB Access',
              detail: `/${share.shareName || 'share'}`,
            })
          }
        }
      }
    } else if (machine.smbNodeIds?.length) {
      for (const nodeId of machine.smbNodeIds) {
        if (nodes.some((n) => n.id === nodeId)) {
          edges.push({
            id: `edge-server-${machine.id}-smb-node-${nodeId}`,
            sourceId: `server-${machine.id}`,
            sourceType: 'server',
            targetId: `node-${nodeId}`,
            targetType: 'node',
            relation: 'smb_link',
            label: 'SMB Storage',
          })
        }
      }
    }
  }

  for (const node of nodes) {
    const parentMachine = serverMachines.find((m) => m.hostedNodeId === node.id)
    const effectiveHomeId = node.homeId ?? parentMachine?.homeId ?? null
    const effectiveHome = effectiveHomeId ? homesMap.get(effectiveHomeId) : null
    const homeName = node.homeName || effectiveHome?.name || null

    items.push({
      id: `node-${node.id}`,
      type: 'node',
      entityId: node.id,
      name: node.name,
      homeId: effectiveHomeId,
      homeName,
      data: { type: 'node', server: { ...node, homeId: effectiveHomeId, homeName } },
    })

    // If the node inherits its home from a parent server machine, it is linked via the parent server
    // (Home -> Server -> Node) and should not be directly linked to the home node.
    if (effectiveHomeId && homesMap.has(effectiveHomeId) && !parentMachine) {
      edges.push({
        id: `edge-home-${effectiveHomeId}-node-${node.id}`,
        sourceId: `home-${effectiveHomeId}`,
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
    if (samba.serverId && serverMachines.some((m) => m.id === samba.serverId)) {
      // Already rendered under the hosting server machine above
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

    if (samba.nodeIds?.length) {
      for (const nodeId of samba.nodeIds) {
        if (nodes.some((n) => n.id === nodeId)) {
          edges.push({
            id: `edge-samba-${samba.id}-node-${nodeId}`,
            sourceId: samba.id,
            sourceType: 'samba',
            targetId: `node-${nodeId}`,
            targetType: 'node',
            relation: 'smb_link',
            label: 'SMB Access',
            detail: `/${samba.shareName}`,
          })
        }
      }
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

  // Include dedicated game servers in topology
  for (const gs of gameServers) {
    items.push({
      id: `game-server-${gs.id}`,
      type: 'game_server',
      entityId: gs.id,
      name: gs.name,
      data: { type: 'game_server', gameServer: gs },
    })

    if (gs.serverMachineId && serverMachines.some((m) => m.id === gs.serverMachineId)) {
      edges.push({
        id: `edge-server-${gs.serverMachineId}-game-server-${gs.id}`,
        sourceId: `server-${gs.serverMachineId}`,
        sourceType: 'server',
        targetId: `game-server-${gs.id}`,
        targetType: 'game_server',
        relation: 'game_server_link',
        label: 'Dedicated Server',
        detail: gs.gameTitle || 'Game Server',
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
  const sambas = items.filter((i) => i.type === 'samba')
  const nodes = items.filter((i) => i.type === 'node')
  const unclaimed = items.filter((i) => i.type === 'unclaimed_node')
  const gameServers = items.filter((i) => i.type === 'game_server')
  const allNodes = [...nodes, ...unclaimed]

  const columnWidth = 320
  const rowHeight = 64

  // Determine active columns
  let columnCount = 0
  if (homes.length > 0) columnCount++
  if (servers.length > 0) columnCount++
  if (sambas.length > 0) columnCount++
  if (allNodes.length > 0) {
    columnCount += columnCount === 0 ? 2 : 1
  }
  if (gameServers.length > 0) columnCount++

  const effectiveColumns = Math.max(columnCount, 1)
  const totalColumnsWidth = effectiveColumns * columnWidth

  const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const layoutWidth = Math.max(totalColumnsWidth, HUB_NODE_WIDTH)
  const startX = anchor?.x ?? Math.max(80, Math.round((windowW - layoutWidth) / 2))
  const startY = anchor?.y ?? 100

  // Position central hub node centered horizontally above the columns
  const hubX = startX + Math.round((layoutWidth - HUB_NODE_WIDTH) / 2)
  const hubY = startY
  positions[HUB_NODE_ID] = { x: hubX, y: hubY }

  const nodesStartY = hubY + HUB_NODE_HEIGHT + 36
  const columnsStartX = startX + Math.round((layoutWidth - totalColumnsWidth) / 2)

  let currentColumn = 0

  if (homes.length > 0) {
    const colX = columnsStartX + currentColumn * columnWidth
    homes.forEach((home, index) => {
      positions[home.id] = { x: colX, y: nodesStartY + index * rowHeight }
    })
    currentColumn++
  }

  if (servers.length > 0) {
    const colX = columnsStartX + currentColumn * columnWidth
    const sortedServers = [...servers].sort((a, b) => {
      const homeA = a.homeId ?? 999999
      const homeB = b.homeId ?? 999999
      return homeA - homeB
    })
    sortedServers.forEach((server, index) => {
      positions[server.id] = { x: colX, y: nodesStartY + index * rowHeight }
    })
    currentColumn++
  }

  if (sambas.length > 0) {
    const colX = columnsStartX + currentColumn * columnWidth
    sambas.forEach((samba, index) => {
      positions[samba.id] = { x: colX, y: nodesStartY + index * rowHeight }
    })
    currentColumn++
  }

  if (allNodes.length > 0) {
    if (currentColumn === 0) {
      // 2-column grid for nodes when no homes or servers exist
      allNodes.forEach((node, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        positions[node.id] = {
          x: columnsStartX + col * columnWidth,
          y: nodesStartY + row * rowHeight,
        }
      })
    } else {
      const colX = columnsStartX + currentColumn * columnWidth
      allNodes.forEach((node, index) => {
        positions[node.id] = { x: colX, y: nodesStartY + index * rowHeight }
      })
    }
    currentColumn++
  }

  if (gameServers.length > 0) {
    const colX = columnsStartX + currentColumn * columnWidth
    const gameServerRowHeight = 94
    gameServers.forEach((gs, index) => {
      positions[gs.id] = { x: colX, y: nodesStartY + index * gameServerRowHeight }
    })
  }

  return positions
}

export interface NodeMapContainerGeometry {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

export const getNodeMapContainerGeometry = (
  containerElement?: HTMLElement | null,
): NodeMapContainerGeometry => {
  if (typeof window === 'undefined') {
    return { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 }
  }

  const target =
    containerElement ||
    (typeof document !== 'undefined'
      ? document.getElementById('settings-nodes-section') ||
        document.getElementById('settings-content')
      : null)

  if (target) {
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return {
        width: rect.width,
        height: rect.height,
        offsetLeft: rect.left,
        offsetTop: rect.top,
      }
    }
  }

  return {
    width: window.innerWidth || 1200,
    height: window.innerHeight || 800,
    offsetLeft: 0,
    offsetTop: 0,
  }
}

export const resolveNodeMapPositions = (
  items: NodeMapItem[],
  anchor?: { x: number; y: number },
): Record<string, NodeMapPosition> => {
  const stored = loadStoredPositions()
  const auto = calculateAutoLayout(items, anchor)
  const merged: Record<string, NodeMapPosition> = {}

  for (const item of items) {
    if (stored[item.id]) {
      merged[item.id] = stored[item.id]
    } else if (auto[item.id]) {
      merged[item.id] = auto[item.id]
    } else {
      merged[item.id] = { x: anchor?.x ?? 340, y: anchor?.y ?? 240 }
    }
  }

  if (stored[HUB_NODE_ID]) {
    merged[HUB_NODE_ID] = stored[HUB_NODE_ID]
  } else if (auto[HUB_NODE_ID]) {
    merged[HUB_NODE_ID] = auto[HUB_NODE_ID]
  } else {
    const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200
    merged[HUB_NODE_ID] = {
      x: Math.round((windowW - HUB_NODE_WIDTH) / 2),
      y: anchor?.y ?? 100,
    }
  }

  return merged
}

export const calculateFitViewport = (
  items: NodeMapItem[],
  positions: Record<string, NodeMapPosition>,
  containerWidth = 1200,
  containerHeight = 800,
  padding = 80,
  offsetLeft = 0,
  offsetTop = 0,
  maxZoom = 1.0,
): { x: number; y: number; zoom: number } => {
  if (items.length === 0 && !positions[HUB_NODE_ID]) return { x: 0, y: 0, zoom: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const item of items) {
    const pos = positions[item.id]
    if (!pos) continue
    const cardWidth = getNodeCardWidth(item.type)
    const cardHeight = getNodeCardHeight(item.type)
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + cardWidth)
    maxY = Math.max(maxY, pos.y + cardHeight)
  }

  const hubPos = positions[HUB_NODE_ID]
  if (hubPos) {
    minX = Math.min(minX, hubPos.x)
    minY = Math.min(minY, hubPos.y)
    maxX = Math.max(maxX, hubPos.x + HUB_NODE_WIDTH)
    maxY = Math.max(maxY, hubPos.y + HUB_NODE_HEIGHT)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, zoom: 1 }
  }

  const contentWidth = Math.max(maxX - minX, 100)
  const contentHeight = Math.max(maxY - minY, 100)

  const availableWidth = Math.max(containerWidth - padding * 2, 200)
  const availableHeight = Math.max(containerHeight - padding * 2, 200)

  const zoomX = availableWidth / contentWidth
  const zoomY = availableHeight / contentHeight
  const rawZoom = Math.min(zoomX, zoomY, maxZoom)
  const zoom = Math.max(0.4, Math.min(rawZoom, maxZoom))

  const x = Math.round(offsetLeft + (containerWidth - contentWidth * zoom) / 2 - minX * zoom)
  const y = Math.round(offsetTop + (containerHeight - contentHeight * zoom) / 2 - minY * zoom)

  return { x, y, zoom: Math.round(zoom * 100) / 100 }
}

export const calculateZoomAtPoint = (
  viewport: NodeMapViewport,
  targetZoom: number,
  pointX: number,
  pointY: number,
  minZoom = 0.35,
  maxZoom = 2.5,
): NodeMapViewport => {
  const nextZoom = Math.min(Math.max(targetZoom, minZoom), maxZoom)
  if (Math.abs(nextZoom - viewport.zoom) < 0.0001) return viewport
  const ratio = nextZoom / viewport.zoom
  const nextX = pointX - (pointX - viewport.x) * ratio
  const nextY = pointY - (pointY - viewport.y) * ratio
  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    zoom: Math.round(nextZoom * 1000) / 1000,
  }
}

export const calculateWheelZoomDelta = (
  deltaY: number,
  isPinchOrCtrl: boolean,
  deltaMode = 0,
): number => {
  if (isPinchOrCtrl) {
    return -deltaY * 0.01
  }
  if (Math.abs(deltaY) >= 50 || deltaMode !== 0) {
    return deltaY < 0 ? 0.12 : -0.12
  }
  return -deltaY * 0.003
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

export const createDefaultSambaConfig = (serverId?: number | null, serverHost?: string): SambaShareConfig => ({
  id: `samba-custom-${Date.now()}`,
  serverId: serverId ?? null,
  serverName: null,
  shareName: 'games',
  host: serverHost || '',
  port: 445,
  username: '',
  password: '',
  workgroup: 'WORKGROUP',
  mountPath: '',
  isOnline: true,
  nodeIds: [],
})

export type CardBorderSide = 'top' | 'bottom' | 'left' | 'right'

export interface BorderAnchorResult {
  point: { x: number; y: number }
  side: CardBorderSide
}

export const getNodeCardBorderAnchor = (
  pos: { x: number; y: number },
  targetPosOrPoint: { x: number; y: number },
  targetIsCard = true,
  width = NODE_CARD_WIDTH,
  height = NODE_CARD_HEIGHT,
  targetWidth = width,
  targetHeight = height,
): BorderAnchorResult => {
  const hw = width / 2
  const hh = height / 2
  const c1 = { x: pos.x + hw, y: pos.y + hh }
  const c2 = targetIsCard
    ? { x: targetPosOrPoint.x + targetWidth / 2, y: targetPosOrPoint.y + targetHeight / 2 }
    : targetPosOrPoint

  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  // Default fallback when items perfectly overlap
  if (absDx < 0.001 && absDy < 0.001) {
    return { point: { x: pos.x + width, y: c1.y }, side: 'right' }
  }

  // Padding to avoid touching rounded corner radiuses (rounded-2xl is 16px)
  const padX = 18
  const padY = 10

  // Check whether horizontal separation dominates or vertical separation dominates
  if (absDx * hh > absDy * hw) {
    // Hits vertical border (left or right)
    const side: CardBorderSide = dx > 0 ? 'right' : 'left'
    const x = dx > 0 ? pos.x + width : pos.x
    const scale = hw / absDx
    const rawY = c1.y + dy * scale

    // If cards are nearly horizontal (within 25% threshold), snap cleanly to middle of the side!
    let y = c1.y
    if (absDy * hw >= 0.25 * absDx * hh) {
      y = Math.max(pos.y + padY, Math.min(pos.y + height - padY, rawY))
    }

    return {
      point: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
      side,
    }
  } else {
    // Hits horizontal border (top or bottom)
    const side: CardBorderSide = dy > 0 ? 'bottom' : 'top'
    const y = dy > 0 ? pos.y + height : pos.y
    const scale = hh / absDy
    const rawX = c1.x + dx * scale

    // If cards are nearly vertical (within 25% threshold), snap cleanly to middle of the side!
    let x = c1.x
    if (absDx * hh >= 0.25 * absDy * hw) {
      x = Math.max(pos.x + padX, Math.min(pos.x + width - padX, rawX))
    }

    return {
      point: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
      side,
    }
  }
}

export interface SmartNodeConnectionResult {
  path: string
  mid: { x: number; y: number }
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  side1: CardBorderSide
  side2: CardBorderSide
}

export const SIDE_NORMALS: Record<CardBorderSide, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  bottom: { x: 0, y: 1 },
  top: { x: 0, y: -1 },
}

export const generateSmartNodeConnectionPath = (
  p1: { x: number; y: number },
  side1: CardBorderSide,
  p2: { x: number; y: number },
  side2: CardBorderSide,
): SmartNodeConnectionResult => {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy)
  const d = Math.min(Math.max(dist * 0.45, 30), 140)

  let cp1: { x: number; y: number }
  let cp2: { x: number; y: number }

  if (side1 === 'right' && side2 === 'left' && dx > 0) {
    const curveD = Math.max(dx * 0.5, 30)
    cp1 = { x: p1.x + curveD, y: p1.y }
    cp2 = { x: p2.x - curveD, y: p2.y }
  } else if (side1 === 'left' && side2 === 'right' && dx < 0) {
    const curveD = Math.max(Math.abs(dx) * 0.5, 30)
    cp1 = { x: p1.x - curveD, y: p1.y }
    cp2 = { x: p2.x + curveD, y: p2.y }
  } else if (side1 === 'bottom' && side2 === 'top' && dy > 0) {
    const curveD = Math.max(dy * 0.5, 24)
    cp1 = { x: p1.x, y: p1.y + curveD }
    cp2 = { x: p2.x, y: p2.y - curveD }
  } else if (side1 === 'top' && side2 === 'bottom' && dy < 0) {
    const curveD = Math.max(Math.abs(dy) * 0.5, 24)
    cp1 = { x: p1.x, y: p1.y - curveD }
    cp2 = { x: p2.x, y: p2.y + curveD }
  } else {
    const n1 = SIDE_NORMALS[side1]
    const n2 = SIDE_NORMALS[side2]
    cp1 = { x: p1.x + n1.x * d, y: p1.y + n1.y * d }
    cp2 = { x: p2.x + n2.x * d, y: p2.y + n2.y * d }
  }

  const path = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`

  const mid = {
    x: 0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y,
  }

  return { path, mid, p1, p2, side1, side2 }
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

  // Samba Share to Worker Node
  if (
    (source.type === 'samba' && target.type === 'node') ||
    (source.type === 'node' && target.type === 'samba')
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

  // Server to WorkerNode (Hosted daemon or SMB network storage)
  if (
    (source.type === 'server' && target.type === 'node') ||
    (source.type === 'node' && target.type === 'server')
  ) {
    return { compatible: true, connectionTypes: ['host', 'smb'] }
  }

  // Dedicated Game Server to Server Machine
  if (
    (source.type === 'game_server' && target.type === 'server') ||
    (source.type === 'server' && target.type === 'game_server')
  ) {
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
      reason: 'Samba shares can only be connected to a Server Machine or Worker Node.',
      connectionTypes: [],
    }
  }

  return {
    compatible: false,
    reason: `Cannot connect ${source.type} directly to ${target.type}`,
    connectionTypes: [],
  }
}

export interface CompatibleTargetOption {
  item: NodeMapItem
  connectionTypes: ('home' | 'host' | 'smb')[]
  label: string
}

export const findCompatibleTargets = (
  source: NodeMapItem,
  allItems: NodeMapItem[],
): CompatibleTargetOption[] => {
  const results: CompatibleTargetOption[] = []

  for (const item of allItems) {
    if (item.id === source.id) continue
    const check = isCompatibleConnection(source, item)
    if (check.compatible && check.connectionTypes.length > 0) {
      let label = 'Connect'
      if (check.connectionTypes.includes('home')) {
        label = item.type === 'home' ? 'Assign to Home' : 'Link via Home'
      } else if (check.connectionTypes.includes('host')) {
        if (source.type === 'game_server' || item.type === 'game_server') {
          label = item.type === 'server' ? 'Run on this Machine' : 'Host Dedicated Game Server'
        } else {
          label = item.type === 'server' ? 'Run on this Server' : 'Host this Node'
        }
      } else if (check.connectionTypes.includes('smb')) {
        label = item.type === 'samba' ? 'Mount Samba Share' : 'Link SMB Storage'
      }

      results.push({
        item,
        connectionTypes: check.connectionTypes,
        label,
      })
    }
  }

  return results
}

export interface TopologyStats {
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  unclaimedNodes: number
  serverCount: number
  homeCount: number
  sambaCount: number
  gameServerCount: number
  gameServerPlayerCount: number
}

export const computeTopologyStats = (
  nodes: GameServer[],
  serverMachines: UserServerMachine[],
  homes: UserHome[],
  pendingNodes: PendingNode[] = [],
  customSambaShares: SambaShareConfig[] = [],
  gameServers: DedicatedGameServer[] = [],
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
  const gameServerCount = gameServers.length
  const gameServerPlayerCount = gameServers.reduce((sum, s) => sum + (s.currentPlayers || 0), 0)

  return {
    totalNodes,
    onlineNodes,
    offlineNodes,
    unclaimedNodes: unclaimed.length,
    serverCount: serverMachines.length,
    homeCount: homes.length,
    sambaCount,
    gameServerCount,
    gameServerPlayerCount,
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

export interface CompatibleCreationOption {
  type: 'server' | 'node' | 'home' | 'samba' | 'game_server'
  title: string
  description: string
  actionLabel: string
}

export const getCompatibleCreationOptions = (
  sourceType: NodeMapItem['type'],
  sourceName: string,
): CompatibleCreationOption[] => {
  switch (sourceType) {
    case 'server':
      return [
        {
          type: 'game_server',
          title: 'Dedicated Game Server',
          description: `Host a multiplayer dedicated game server on "${sourceName}".`,
          actionLabel: 'Add Game Server',
        },
        {
          type: 'samba',
          title: 'Samba Share (SMB)',
          description: `Create an SMB network share hosted on "${sourceName}".`,
          actionLabel: 'Add Samba Share',
        },
        {
          type: 'node',
          title: 'Otix Worker Node',
          description: `Connect or claim an Otix worker daemon to run on "${sourceName}".`,
          actionLabel: 'Add Worker Node',
        },
        {
          type: 'home',
          title: 'Home Environment',
          description: `Assign "${sourceName}" to a local network home location.`,
          actionLabel: 'Add Home',
        },
      ]
    case 'node':
      return [
        {
          type: 'server',
          title: 'Machine',
          description: 'Host this node daemon on a dedicated machine or computer.',
          actionLabel: 'Add Machine',
        },
        {
          type: 'samba',
          title: 'Samba Share (SMB)',
          description: 'Add a Samba network share to mount on this node.',
          actionLabel: 'Add Samba Share',
        },
        {
          type: 'home',
          title: 'Home Environment',
          description: 'Group this node under a local home environment.',
          actionLabel: 'Add Home',
        },
      ]
    case 'home':
      return [
        {
          type: 'server',
          title: 'Machine',
          description: `Add a computer or server machine located in "${sourceName}".`,
          actionLabel: 'Add Machine',
        },
        {
          type: 'node',
          title: 'Otix Worker Node',
          description: `Connect or claim an Otix node located in "${sourceName}".`,
          actionLabel: 'Add Worker Node',
        },
      ]
    case 'samba':
      return [
        {
          type: 'server',
          title: 'Machine',
          description: 'Host this share from a computer or server machine.',
          actionLabel: 'Add Machine',
        },
        {
          type: 'node',
          title: 'Otix Worker Node',
          description: 'Mount this share on an Otix worker node.',
          actionLabel: 'Add Worker Node',
        },
      ]
    default:
      return []
  }
}

