import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from './server-machines'

export type NodeMapItemType = 'home' | 'server' | 'node'

export type NodeMapEdgeRelation = 'home_link' | 'hosted_link' | 'smb_link'

export interface NodeMapPosition {
  x: number
  y: number
}

export interface NodeMapItem {
  id: string
  type: NodeMapItemType
  entityId: number
  name: string
  homeId?: number | null
  homeName?: string | null
  data:
    | { type: 'home'; home: UserHome }
    | { type: 'server'; machine: UserServerMachine }
    | { type: 'node'; server: GameServer }
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
