import { isDesktop } from '@/lib/desktop/api'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import type { GameServer } from '@/features/downloads/types'

/** Sentinel id for the Otix desktop app when it is treated as a node. */
export const LOCAL_DESKTOP_NODE_ID = -1

export function isLocalDesktopNodeId(id: number | null | undefined): boolean {
  return id === LOCAL_DESKTOP_NODE_ID
}

export function isLocalDesktopNode(server: { id?: number; isLocalDesktop?: boolean } | null | undefined): boolean {
  return Boolean(server?.isLocalDesktop || isLocalDesktopNodeId(server?.id))
}

export function localDesktopNodeName(): string {
  const platform = getDesktopPlatform().platform
  if (platform === 'darwin') return 'This Mac'
  if (platform === 'win32') return 'This PC'
  return 'This computer'
}

export function getLocalDesktopNodeFallback(): GameServer {
  return {
    id: LOCAL_DESKTOP_NODE_ID,
    name: localDesktopNodeName(),
    primaryUrl: 'otix://desktop',
    localUrl: 'otix://desktop',
    isOnline: true,
    isActive: false,
    totalFiles: 0,
    storageFreeBytes: 0,
    storageTotalBytes: 0,
    createdAt: '',
    updatedAt: '',
    isLocalDesktop: true,
  }
}

export function getLocalDesktopNode(): GameServer | null {
  if (typeof window === 'undefined' || !isDesktop()) return null
  return getLocalDesktopNodeFallback()
}

export function mergeLocalDesktopNode(servers: GameServer[]): GameServer[] {
  const local = getLocalDesktopNode()
  if (!local) return servers
  if (servers.some((server) => isLocalDesktopNode(server))) return servers
  return [local, ...servers]
}

export function pickSettingsNode(servers: GameServer[], preferredId: number | null): GameServer | null {
  if (!servers.length) return null
  const workers = servers.filter((server) => !isLocalDesktopNode(server))
  return (
    servers.find((server) => server.id === preferredId) ||
    servers.find((server) => server.isLocalDesktop) ||
    workers.find((server) => server.isActive) ||
    workers.find((server) => server.isOnline) ||
    workers[0] ||
    servers[0]
  )
}
