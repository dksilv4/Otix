import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../local-desktop-node'

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
      label: isLocal ? `${s.name} (Otix App)` : s.name,
      isOnline: Boolean(s.isOnline),
      isLocal,
      isGlobal: false,
      host: s.primaryUrl || s.localUrl || undefined,
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

  const effectiveId = nodeId ?? (servers[0]?.id ?? GLOBAL_PROFILE_NODE_ID)
  const matched = servers.find((s) => s.id === effectiveId)

  if (!matched) {
    if (effectiveId === GLOBAL_PROFILE_NODE_ID) {
      return {
        id: GLOBAL_PROFILE_NODE_ID,
        name: 'Default Node Profile',
        isOnline: true,
        isLocal: false,
        isGlobal: true,
        description: 'Account-wide defaults applied automatically to new worker nodes.',
      }
    }
    return {
      id: effectiveId,
      name: `Node #${effectiveId}`,
      isOnline: false,
      isLocal: false,
      isGlobal: false,
      description: 'Standalone worker node',
    }
  }

  const isLocal = isLocalDesktopNode(matched)
  return {
    id: matched.id,
    name: matched.name,
    isOnline: Boolean(matched.isOnline),
    isLocal,
    isGlobal: false,
    host: matched.primaryUrl || matched.localUrl || undefined,
    description: isLocal
      ? 'Local Otix desktop application on this computer.'
      : matched.isOnline
        ? 'Connected and synchronized worker node.'
        : 'Worker node currently offline — changes will sync once online.',
  }
}
