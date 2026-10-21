import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { UserHome, UserServerMachine } from './server-machines'

export type NodeMapItemType = 'home' | 'server' | 'node' | 'unclaimed_node' | 'samba'

export type NodeMapEdgeRelation = 'home_link' | 'hosted_link' | 'smb_link' | 'samba_server_link'

export interface SambaShareConfig {
  id: string
  serverId?: number | null
  serverName?: string | null
  shareName: string
  host?: string
  port: number
  username?: string
  password?: string
  workgroup?: string
  mountPath?: string
  isOnline?: boolean
  nodeIds?: number[]
}

export interface NodeMapPosition {
  x: number
  y: number
}

export interface NodeMapItem {
  id: string
  type: NodeMapItemType
  entityId: number | string
  name: string
  homeId?: number | null
  homeName?: string | null
  data: {
    type: NodeMapItemType
    home?: UserHome
    machine?: UserServerMachine
    server?: GameServer
    pending?: PendingNode
    samba?: SambaShareConfig
    [key: string]: unknown
  }
}

export interface NodeMapEdge {
  id: string
  sourceId: string
  sourceType: NodeMapItemType
  targetId: string
  targetType: NodeMapItemType
  relation: NodeMapEdgeRelation
  label: string
  detail?: string
}

export interface NodeMapViewport {
  x: number
  y: number
  zoom: number
}

export interface NodeMapConnectPrompt {
  source: NodeMapItem
  target: NodeMapItem
  allowedTypes: Array<'home' | 'host' | 'smb'>
}
