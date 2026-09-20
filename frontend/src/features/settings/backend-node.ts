import type { GameServer } from '@/features/downloads/types'

/** Sentinel id for the Otix backend when it is treated as a node. */
export const BACKEND_NODE_ID = -2

export function isBackendNodeId(id: number | null | undefined): boolean {
  return id === BACKEND_NODE_ID
}

export function isBackendNode(server: { id?: number; isBackend?: boolean } | null | undefined): boolean {
  return Boolean(server?.isBackend || isBackendNodeId(server?.id))
}

export function getBackendNode(): GameServer {
  return {
    id: BACKEND_NODE_ID,
    name: 'Otix backend',
    primaryUrl: 'otix://backend',
    localUrl: 'otix://backend',
    remoteUrl: 'otix://backend',
    isOnline: true,
    isActive: false,
    totalFiles: 0,
    storageFreeBytes: 0,
    storageTotalBytes: 0,
    createdAt: '',
    updatedAt: '',
    isBackend: true,
  }
}

export function mergeBackendNode(servers: GameServer[]): GameServer[] {
  if (servers.some((server) => isBackendNode(server))) return servers
  return [getBackendNode(), ...servers]
}
