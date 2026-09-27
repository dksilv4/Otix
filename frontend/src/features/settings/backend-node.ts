import type { GameServer } from '@/features/downloads/types'

/**
 * Backend is no longer treated as a node.
 * Self-hosting features are exclusively handled by Otix Node instances.
 */
export const BACKEND_NODE_ID = -2

export function isBackendNodeId(id: number | null | undefined): boolean {
  return id === BACKEND_NODE_ID
}

export function isBackendNode(server: { id?: number; isBackend?: boolean } | null | undefined): boolean {
  return Boolean(server?.isBackend || isBackendNodeId(server?.id))
}

/** No-op: Backend is no longer a node and is never injected into the node list. */
export function mergeBackendNode(servers: GameServer[]): GameServer[] {
  return servers
}

