import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode, LOCAL_DESKTOP_NODE_ID } from '../local-desktop-node'

export const GLOBAL_PROFILE_NODE_ID = 0

export function isGlobalProfileId(id: number | null | undefined): boolean {
  return id === GLOBAL_PROFILE_NODE_ID
}

export interface NodeSwitcherOption {
  value: string
  label: string
  isOnline: boolean
  isLocal: boolean
  isGlobal: boolean
  host?: string
}

export function buildNodeSwitcherOptions(servers: GameServer[]): NodeSwitcherOption[] {
  const options: NodeSwitcherOption[] = [
    {
      value: String(GLOBAL_PROFILE_NODE_ID),
      label: 'Default Node Profile (Global)',
      isOnline: true,
      isLocal: false,
      isGlobal: true,
    },
  ]

  for (const s of servers) {
    const isLocal = isLocalDesktopNode(s)
    options.push({
      value: String(s.id),
      label: s.name,
      isOnline: Boolean(s.isOnline),
      isLocal,
      isGlobal: false,
      host: isLocal ? 'otix://desktop' : s.primaryUrl || s.localUrl || undefined,
    })
  }

  return options
}

export interface ActiveNodeInfo {
  id: number
  name: string
  isOnline: boolean
  isLocal: boolean
  isGlobal: boolean
  host?: string
  description: string
}

export function getActiveNodeInfo(
  nodeId: number | null | undefined,
  servers: GameServer[],
): ActiveNodeInfo {
  if (nodeId === GLOBAL_PROFILE_NODE_ID) {
    return {
      id: GLOBAL_PROFILE_NODE_ID,
      name: 'Default Node Profile',
      isOnline: true,
      isLocal: false,
      isGlobal: true,
      description: 'Account-wide defaults applied automatically to new worker nodes.',
    }
  }

  const effectiveId = nodeId ?? (servers[0]?.id ?? LOCAL_DESKTOP_NODE_ID)
  const matched = servers.find((s) => s.id === effectiveId)

  if (!matched) {
    return {
      id: effectiveId,
      name: effectiveId === LOCAL_DESKTOP_NODE_ID ? 'This PC' : `Node #${effectiveId}`,
      isOnline: true,
      isLocal: effectiveId === LOCAL_DESKTOP_NODE_ID,
      isGlobal: false,
      description: effectiveId === LOCAL_DESKTOP_NODE_ID ? 'Local desktop companion' : 'Standalone worker node',
    }
  }

  const isLocal = isLocalDesktopNode(matched)
  return {
    id: matched.id,
    name: matched.name,
    isOnline: Boolean(matched.isOnline),
    isLocal,
    isGlobal: false,
    host: isLocal ? 'otix://desktop' : matched.primaryUrl || matched.localUrl || undefined,
    description: isLocal
      ? 'Local Otix application and companion services on this computer.'
      : matched.isOnline
        ? 'Connected and synchronized worker node.'
        : 'Worker node currently offline — changes will sync once online.',
  }
}
