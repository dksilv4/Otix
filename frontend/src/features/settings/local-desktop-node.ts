import { isDesktop } from '@/lib/desktop/api'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import type { GameServer } from '@/features/downloads/types'
import { nodeUrlKey, type PendingNode } from '@/features/downloads/pending-nodes'

/** Sentinel id for the Otix desktop app when it is treated as a node. */
export const LOCAL_DESKTOP_NODE_ID = -1

const knownLocalDesktopIds = new Set<number>([LOCAL_DESKTOP_NODE_ID])

export function registerLocalDesktopNodeId(id: number | null | undefined): void {
  if (id != null && !Number.isNaN(Number(id))) {
    knownLocalDesktopIds.add(Number(id))
  }
}

export function isLocalDesktopNodeId(id: number | null | undefined): boolean {
  if (id == null) return false
  const numId = Number(id)
  if (Number.isNaN(numId)) return false
  if (knownLocalDesktopIds.has(numId)) return true

  // Inspect localStorage cached servers if available in client
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('otix:cached-servers')
      if (raw) {
        const servers = JSON.parse(raw)
        if (Array.isArray(servers)) {
          for (const s of servers) {
            if (
              s &&
              (s.isLocalDesktop ||
                s.localUrl?.startsWith('otix://desktop') ||
                s.primaryUrl?.startsWith('otix://desktop'))
            ) {
              if (s.id != null) {
                knownLocalDesktopIds.add(Number(s.id))
              }
            }
          }
          if (knownLocalDesktopIds.has(numId)) return true
        }
      }
    } catch {
      // ignore
    }
  }

  return false
}

export function isLocalDesktopNode(
  server: { id?: number; isLocalDesktop?: boolean; localUrl?: string | null; primaryUrl?: string | null } | null | undefined,
): boolean {
  const isLocal = Boolean(
    server?.isLocalDesktop ||
      (server?.id != null && knownLocalDesktopIds.has(Number(server.id))) ||
      server?.localUrl?.startsWith('otix://desktop') ||
      server?.primaryUrl?.startsWith('otix://desktop'),
  )
  if (isLocal && server?.id != null) {
    registerLocalDesktopNodeId(server.id)
  }
  return isLocal
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

export function isBrowserSessionNode(server: { name?: string | null } | null | undefined): boolean {
  const name = (server?.name || '').toLowerCase()
  return (
    name.startsWith('chrome on') ||
    name.startsWith('firefox on') ||
    name.startsWith('edge on') ||
    name.startsWith('safari on') ||
    name.startsWith('browser on')
  )
}

export function mergeLocalDesktopNode(servers: GameServer[]): GameServer[] {
  // Prune any lingering browser sessions — browser sessions are never nodes
  const validServers = servers.filter((s) => !isBrowserSessionNode(s))
  // If servers already contains a registered desktop node (from backend DB), keep it
  for (const server of validServers) {
    if (isLocalDesktopNode(server)) {
      registerLocalDesktopNodeId(server.id)
    }
  }
  if (validServers.some((server) => isLocalDesktopNode(server))) {
    return validServers
  }
  // Otherwise, if in desktop app environment, prepend local desktop fallback
  const local = getLocalDesktopNode()
  if (!local) return validServers
  return [local, ...validServers]
}

export function syncServersWithPendingNodes(servers: GameServer[], pendingNodes: PendingNode[]): GameServer[] {
  if (!pendingNodes.length || !servers.length) return servers
  return servers.map((server) => {
    if (isLocalDesktopNode(server)) {
      registerLocalDesktopNodeId(server.id)
      return server
    }
    const match = pendingNodes.find(
      (p) =>
        (p.authToken && server.authToken && p.authToken === server.authToken) ||
        (p.localUrl && server.localUrl && nodeUrlKey(p.localUrl) === nodeUrlKey(server.localUrl)) ||
        (p.localUrl && server.primaryUrl && nodeUrlKey(p.localUrl) === nodeUrlKey(server.primaryUrl)),
    )
    if (!match) return server
    const effectiveName =
      match.serverName &&
      match.serverName !== 'Otix Game Server' &&
      match.serverName !== 'Otix Node' &&
      !match.serverName.startsWith('Node ID:')
        ? match.serverName
        : server.name

    if (effectiveName !== server.name || (!server.isOnline && match.claimed)) {
      return {
        ...server,
        name: effectiveName,
        isOnline: server.isOnline || Boolean(match.claimed),
      }
    }
    return server
  })
}

export function pickSettingsNode(servers: GameServer[], preferredId: number | null): GameServer | null {
  if (preferredId === 0) return null
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
