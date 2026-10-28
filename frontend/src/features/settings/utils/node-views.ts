import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { DedicatedGameServer } from '@/features/gameservers/types'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { NodeMapItem, NodeMapItemType, SambaShareConfig } from '../types/node-map'
import { isLocalDesktopNode } from '../local-desktop-node'
import { getOSLabel } from './server-machines'
import { formatBytes } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { Network, FolderOpen, Sparkles, Wand2, Link2 } from 'lucide-react'
import type { ComponentType } from 'react'

export const getNavPillsTopOffset = (isMap: boolean): string => {
  const desktop = isDesktop()
  if (isMap) {
    return desktop ? 'top-24 sm:top-28' : 'top-16 sm:top-20'
  }
  return desktop ? 'pt-24 sm:pt-28' : 'pt-16 sm:pt-20'
}

export type NodesActiveTab = 'infrastructure' | 'paths' | 'organize' | 'connections' | 'proposals'

export const NODES_ACTIVE_TAB_STORAGE_KEY = 'otix:nodes-active-tab'

export const resolveNodesActiveTabFromHash = (hash: string | null | undefined): NodesActiveTab | null => {
  if (!hash) return null
  const clean = hash.replace(/^#/, '').toLowerCase()
  if (
    clean === 'paths' ||
    clean === 'organize' ||
    clean === 'connections' ||
    clean === 'proposals' ||
    clean === 'infrastructure'
  ) {
    return clean
  }
  return null
}

export const loadStoredNodesActiveTab = (): NodesActiveTab => {
  if (typeof window === 'undefined') return 'infrastructure'
  try {
    const fromHash = resolveNodesActiveTabFromHash(window.location.hash)
    if (fromHash) return fromHash
    const search = new URLSearchParams(window.location.search).get('tab')
    if (
      search === 'paths' ||
      search === 'organize' ||
      search === 'connections' ||
      search === 'proposals' ||
      search === 'infrastructure'
    ) {
      return search
    }
    const stored = window.localStorage.getItem(NODES_ACTIVE_TAB_STORAGE_KEY)
    if (
      stored === 'paths' ||
      stored === 'organize' ||
      stored === 'connections' ||
      stored === 'proposals' ||
      stored === 'infrastructure'
    ) {
      return stored
    }
  } catch {
    // ignore
  }
  return 'infrastructure'
}

export const saveStoredNodesActiveTab = (tab: NodesActiveTab): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NODES_ACTIVE_TAB_STORAGE_KEY, tab)
  } catch {
    // ignore
  }
}

export interface NodesTabDefinition {
  id: NodesActiveTab
  label: string
  description: string
  iconName: 'Network' | 'FolderOpen' | 'Sparkles' | 'Link2' | 'Wand2'
}

export const NODES_WORKSPACE_TABS: NodesTabDefinition[] = [
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Topology map, connected worker daemons, and homelab servers',
    iconName: 'Network',
  },
  {
    id: 'paths',
    label: 'Paths',
    description: 'Library scan locations, ISO folders, and game storage directories per node',
    iconName: 'FolderOpen',
  },
  {
    id: 'organize',
    label: 'Organize',
    description: 'Directory structure, renaming presets, repack rules, and automation per node',
    iconName: 'Sparkles',
  },
  {
    id: 'connections',
    label: 'Connections',
    description: 'Downloader clients, indexers, and arr service integrations per node',
    iconName: 'Link2',
  },
  {
    id: 'proposals',
    label: 'Match Proposals',
    description: 'Metadata matching candidates, review suggestions, and game identity confirmation',
    iconName: 'Wand2',
  },
]

export const getNodesTabIcon = (tabId: NodesActiveTab): ComponentType<{ className?: string }> => {
  switch (tabId) {
    case 'infrastructure':
      return Network
    case 'paths':
      return FolderOpen
    case 'organize':
      return Sparkles
    case 'connections':
      return Link2
    case 'proposals':
      return Wand2
  }
}

export type NodesViewMode = 'map' | 'grid' | 'list'

export const NODES_VIEW_STORAGE_KEY = 'otix:nodes-view-mode'

export const loadStoredNodesViewMode = (): NodesViewMode => {
  if (typeof window === 'undefined') return 'map'
  try {
    const stored = window.localStorage.getItem(NODES_VIEW_STORAGE_KEY)
    if (stored === 'map' || stored === 'grid' || stored === 'list') {
      return stored
    }
  } catch {
    // ignore
  }
  return 'map'
}

export const saveStoredNodesViewMode = (mode: NodesViewMode): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NODES_VIEW_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export const SETTINGS_PREV_TAB_STORAGE_KEY = 'otix:settings-previous-non-nodes-tab'

export const rememberPreviousSettingsTab = (tab: string): void => {
  if (typeof window === 'undefined') return
  if (!tab || tab === 'nodes') return
  try {
    window.localStorage.setItem(SETTINGS_PREV_TAB_STORAGE_KEY, tab)
  } catch {
    // ignore
  }
}

export const getPreviousSettingsTab = (fallback = 'general'): string => {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(SETTINGS_PREV_TAB_STORAGE_KEY)
    if (stored && stored !== 'nodes') return stored
  } catch {
    // ignore
  }
  return fallback
}

export type NodesCategoryFilter = 'all' | 'nodes' | 'machines' | 'storage' | 'game_servers'

export type NodesStatusFilter = 'all' | 'online' | 'offline'

export interface UnifiedInfrastructureItem {
  id: string
  entityId: string | number
  name: string
  type: 'node' | 'server' | 'samba' | 'game_server' | 'unclaimed_node'
  typeLabel: string
  isOnline: boolean
  latencyMs?: number | null
  homeId?: number | null
  homeName?: string | null
  endpoint: string
  storageSummary?: string | null
  storagePercent?: number | null
  details?: string | null
  raw: {
    node?: GameServer
    machine?: UserServerMachine
    samba?: SambaShareConfig
    gameServer?: DedicatedGameServer
    unclaimed?: PendingNode
  }
}

export interface FlattenInfrastructureParams {
  nodes?: GameServer[]
  serverMachines?: UserServerMachine[]
  homes?: UserHome[]
  customSambaShares?: SambaShareConfig[]
  gameServers?: DedicatedGameServer[]
  unclaimedNodes?: PendingNode[]
}

export const flattenInfrastructureItems = ({
  nodes = [],
  serverMachines = [],
  homes = [],
  customSambaShares = [],
  gameServers = [],
  unclaimedNodes = [],
}: FlattenInfrastructureParams): UnifiedInfrastructureItem[] => {
  const items: UnifiedInfrastructureItem[] = []
  const homesMap = new Map<number, string>()
  for (const home of homes) {
    homesMap.set(home.id, home.name)
  }

  // 1. Unclaimed nodes
  for (const pending of unclaimedNodes) {
    items.push({
      id: `unclaimed-${pending.claimCode || pending.localUrl}`,
      entityId: pending.claimCode || pending.localUrl || 'pending',
      name: pending.serverName || 'Discovered Otix Node',
      type: 'unclaimed_node',
      typeLabel: 'Unclaimed Node',
      isOnline: true,
      endpoint: pending.localUrl || '',
      details: pending.claimCode ? `Claim PIN: ${pending.claimCode}` : 'Awaiting Claim',
      raw: { unclaimed: pending },
    })
  }

  // 2. Worker nodes
  for (const node of nodes) {
    const isLocal = isLocalDesktopNode(node)
    const homeName = node.homeId ? homesMap.get(node.homeId) || node.homeName : node.homeName
    let storageSummary: string | null = null
    let storagePercent: number | null = null

    if (node.storageTotalBytes && node.storageTotalBytes > 0) {
      const free = node.storageFreeBytes || 0
      const used = Math.max(0, node.storageTotalBytes - free)
      storageSummary = `${formatBytes(free)} free / ${formatBytes(node.storageTotalBytes)}`
      storagePercent = Math.min(100, Math.round((used / node.storageTotalBytes) * 100))
    } else if (node.totalFiles && node.totalFiles > 0) {
      storageSummary = `${node.totalFiles} hosted file${node.totalFiles === 1 ? '' : 's'}`
    }

    items.push({
      id: `node-${node.id}`,
      entityId: node.id,
      name: node.name,
      type: 'node',
      typeLabel: isLocal ? 'Companion Node' : 'Worker Node',
      isOnline: Boolean(node.isOnline),
      latencyMs: null,
      homeId: node.homeId,
      homeName: homeName || null,
      endpoint: node.localUrl || node.primaryUrl || '',
      storageSummary,
      storagePercent,
      details: isLocal ? 'Running locally on this device' : undefined,
      raw: { node },
    })
  }

  // 3. Server Machines
  for (const machine of serverMachines) {
    const homeName = machine.homeId ? homesMap.get(machine.homeId) || machine.homeName : machine.homeName
    let storageSummary: string | null = null
    let storagePercent: number | null = null

    if (machine.totalStorageBytes && machine.totalStorageBytes > 0) {
      const free = machine.freeStorageBytes || 0
      const used = Math.max(0, machine.totalStorageBytes - free)
      storageSummary = `${formatBytes(free)} free / ${formatBytes(machine.totalStorageBytes)}`
      storagePercent = Math.min(100, Math.round((used / machine.totalStorageBytes) * 100))
    }

    items.push({
      id: `server-${machine.id}`,
      entityId: machine.id,
      name: machine.name,
      type: 'server',
      typeLabel: getOSLabel(machine.os) || 'Server Machine',
      isOnline: Boolean(machine.isOnline),
      homeId: machine.homeId,
      homeName: homeName || null,
      endpoint: machine.host || '',
      storageSummary,
      storagePercent,
      details: machine.hostedNodeName ? `Hosts: ${machine.hostedNodeName}` : machine.smbEnabled ? 'Samba active' : undefined,
      raw: { machine },
    })
  }

  // 4. Custom & Server Samba Shares
  const seenSamba = new Set<string>()
  for (const machine of serverMachines) {
    const machineShares: SambaShareConfig[] = []
    const seenShareNames = new Set<string>()

    if (machine.smbShares && Array.isArray(machine.smbShares)) {
      for (const sh of machine.smbShares) {
        if (!sh || !sh.shareName) continue
        const key = sh.shareName.toLowerCase()
        if (!seenShareNames.has(key)) {
          seenShareNames.add(key)
          machineShares.push({
            id: sh.id || `smb-machine-${machine.id}-${sh.shareName}`,
            serverId: machine.id,
            serverName: machine.name,
            shareName: sh.shareName,
            host: sh.host || machine.smbHost || machine.host || '',
            port: sh.port || machine.smbPort || 445,
            isOnline: machine.isOnline,
            nodeIds: sh.nodeIds || machine.smbNodeIds || [],
          })
        }
      }
    }

    if (machine.smbEnabled && machine.smbShareName) {
      const key = machine.smbShareName.toLowerCase()
      if (!seenShareNames.has(key)) {
        seenShareNames.add(key)
        machineShares.unshift({
          id: `smb-machine-${machine.id}`,
          serverId: machine.id,
          serverName: machine.name,
          shareName: machine.smbShareName,
          host: machine.smbHost || machine.host || '',
          port: machine.smbPort || 445,
          isOnline: machine.isOnline,
          nodeIds: machine.smbNodeIds || [],
        })
      }
    }

    for (const sh of customSambaShares) {
      if (sh.serverId === machine.id && sh.shareName) {
        const key = sh.shareName.toLowerCase()
        if (!seenShareNames.has(key)) {
          seenShareNames.add(key)
          machineShares.push({
            ...sh,
            id: sh.id || `smb-custom-${machine.id}-${sh.shareName}`,
            serverId: machine.id,
            serverName: machine.name,
            isOnline: machine.isOnline,
          })
        }
      }
    }

    for (const sh of machineShares) {
      seenSamba.add(sh.id)
      items.push({
        id: sh.id,
        entityId: sh.id,
        name: sh.shareName ? `/${sh.shareName}` : 'Samba Share',
        type: 'samba',
        typeLabel: 'Network Share (SMB)',
        isOnline: Boolean(sh.isOnline ?? machine.isOnline),
        homeId: machine.homeId,
        homeName: machine.homeId ? homesMap.get(machine.homeId) : null,
        endpoint: `${sh.host || machine.host || 'localhost'}:${sh.port || 445}`,
        details: `Hosted on ${machine.name}`,
        raw: { samba: sh },
      })
    }
  }

  for (const samba of customSambaShares) {
    if (seenSamba.has(samba.id)) continue
    seenSamba.add(samba.id)
    items.push({
      id: samba.id,
      entityId: samba.id,
      name: samba.shareName ? `/${samba.shareName}` : 'Samba Share',
      type: 'samba',
      typeLabel: 'Network Share (SMB)',
      isOnline: samba.isOnline ?? true,
      endpoint: samba.host ? `${samba.host}:${samba.port || 445}` : '',
      details: samba.serverName ? `Hosted on ${samba.serverName}` : 'Standalone SMB',
      raw: { samba },
    })
  }

  // 5. Dedicated Game Servers
  for (const gs of gameServers) {
    items.push({
      id: `game-server-${gs.id}`,
      entityId: gs.id,
      name: gs.name,
      type: 'game_server',
      typeLabel: gs.gameTitle || 'Game Server',
      isOnline: gs.status === 'online',
      latencyMs: gs.pingMs ?? null,
      endpoint: gs.connectionAddress || '',
      details: gs.currentPlayers != null ? `${gs.currentPlayers}/${gs.maxPlayers || '?'} online` : gs.serverType,
      raw: { gameServer: gs },
    })
  }

  return items
}

export const filterInfrastructureItems = (
  items: UnifiedInfrastructureItem[],
  searchQuery: string,
  categoryFilter: NodesCategoryFilter = 'all',
  statusFilter: NodesStatusFilter = 'all',
): UnifiedInfrastructureItem[] => {
  const query = searchQuery.trim().toLowerCase()

  return items.filter((item) => {
    // 1. Status Filter
    if (statusFilter === 'online' && !item.isOnline) return false
    if (statusFilter === 'offline' && item.isOnline) return false

    // 2. Category Filter
    if (categoryFilter === 'nodes' && item.type !== 'node' && item.type !== 'unclaimed_node') return false
    if (categoryFilter === 'machines' && item.type !== 'server') return false
    if (categoryFilter === 'storage' && item.type !== 'samba') return false
    if (categoryFilter === 'game_servers' && item.type !== 'game_server') return false

    // 3. Search Query
    if (!query) return true

    return (
      item.name.toLowerCase().includes(query) ||
      item.typeLabel.toLowerCase().includes(query) ||
      item.endpoint.toLowerCase().includes(query) ||
      (item.homeName && item.homeName.toLowerCase().includes(query)) ||
      (item.details && item.details.toLowerCase().includes(query))
    )
  })
}

export interface GroupedInfrastructureItems {
  unclaimed: UnifiedInfrastructureItem[]
  nodes: UnifiedInfrastructureItem[]
  servers: UnifiedInfrastructureItem[]
  samba: UnifiedInfrastructureItem[]
  gameServers: UnifiedInfrastructureItem[]
}

export const groupInfrastructureItems = (
  items: UnifiedInfrastructureItem[],
): GroupedInfrastructureItems => {
  const grouped: GroupedInfrastructureItems = {
    unclaimed: [],
    nodes: [],
    servers: [],
    samba: [],
    gameServers: [],
  }

  for (const item of items) {
    if (item.type === 'unclaimed_node') {
      grouped.unclaimed.push(item)
    } else if (item.type === 'node') {
      grouped.nodes.push(item)
    } else if (item.type === 'server') {
      grouped.servers.push(item)
    } else if (item.type === 'samba') {
      grouped.samba.push(item)
    } else if (item.type === 'game_server') {
      grouped.gameServers.push(item)
    }
  }

  return grouped
}

export const isNodeMapItemCategoryMatch = (
  itemType: NodeMapItemType,
  categoryFilter: NodesCategoryFilter = 'all',
): boolean => {
  if (!categoryFilter || categoryFilter === 'all') return true
  if (categoryFilter === 'nodes') return itemType === 'node' || itemType === 'unclaimed_node'
  if (categoryFilter === 'machines') return itemType === 'server' || itemType === 'home'
  if (categoryFilter === 'storage') return itemType === 'samba'
  if (categoryFilter === 'game_servers') return itemType === 'game_server'
  return true
}

export const isNodeMapItemStatusMatch = (
  item: NodeMapItem,
  statusFilter: NodesStatusFilter = 'all',
): boolean => {
  if (!statusFilter || statusFilter === 'all') return true
  let isOnline = true
  if (item.type === 'node') {
    isOnline = Boolean(item.data.server?.isOnline)
  } else if (item.type === 'server') {
    isOnline = Boolean(item.data.machine?.isOnline)
  } else if (item.type === 'game_server') {
    isOnline = item.data.gameServer?.status === 'online'
  } else if (item.type === 'samba') {
    isOnline = item.data.samba?.isOnline ?? true
  } else if (item.type === 'unclaimed_node') {
    isOnline = true
  } else if (item.type === 'home') {
    isOnline = true
  }
  return statusFilter === 'online' ? isOnline : !isOnline
}

export const isNodeMapItemMatch = (
  item: NodeMapItem,
  searchQuery = '',
  categoryFilter: NodesCategoryFilter = 'all',
  statusFilter: NodesStatusFilter = 'all',
): boolean => {
  if (!isNodeMapItemCategoryMatch(item.type, categoryFilter)) return false
  if (!isNodeMapItemStatusMatch(item, statusFilter)) return false
  const q = searchQuery.trim().toLowerCase()
  if (!q) return true
  return item.name.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)
}


