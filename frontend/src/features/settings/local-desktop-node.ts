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
  if (Number.isNaN(numId) || numId <= 0) return false
  if (knownLocalDesktopIds.has(numId)) return true

  // Inspect localStorage cached nodes if available in client
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('otix:cached-nodes') || localStorage.getItem('otix:cached-servers')
      if (raw) {
        const nodes = JSON.parse(raw)
        if (Array.isArray(nodes)) {
          for (const s of nodes) {
            if (
              s &&
              (s.isLocalDesktop ||
                s.localUrl?.startsWith('otix://desktop') ||
                s.primaryUrl?.startsWith('otix://desktop'))
            ) {
              if (s.id != null && Number(s.id) > 0) {
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
  server:
    | {
        id?: number
        isLocalDesktop?: boolean
        is_local?: boolean
        isLocal?: boolean
        localUrl?: string | null
        primaryUrl?: string | null
      }
    | null
    | undefined,
): boolean {
  if (!server) return false
  const isLoopback = Boolean(
    server.localUrl?.includes('127.0.0.1') ||
      server.localUrl?.includes('localhost') ||
      server.primaryUrl?.includes('127.0.0.1') ||
      server.primaryUrl?.includes('localhost'),
  )
  const isLocal = Boolean(
    server.isLocalDesktop ||
      server.is_local ||
      server.isLocal ||
      isLoopback ||
      (server.id != null && server.id > 0 && knownLocalDesktopIds.has(Number(server.id))) ||
      server.localUrl?.startsWith('otix://desktop') ||
      server.primaryUrl?.startsWith('otix://desktop'),
  )
  if (isLocal && server.id != null && server.id > 0) {
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

export function findLocalDesktopNode<
  T extends { id?: number; isLocalDesktop?: boolean; localUrl?: string | null; primaryUrl?: string | null },
>(nodes: T[]): T | null {
  return nodes.find((node) => isLocalDesktopNode(node)) || null
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

export function isVirtualDesktopNode(
  server: { id?: number; localUrl?: string | null; primaryUrl?: string | null } | null | undefined,
): boolean {
  if (!server) return false
  return Boolean(
    server.localUrl?.startsWith('otix://') ||
      server.primaryUrl?.startsWith('otix://'),
  )
}

export function mergeLocalDesktopNode(servers: GameServer[]): GameServer[] {
  // Prune any lingering browser sessions and virtual otix:// desktop nodes
  const validServers = servers.filter((s) => !isBrowserSessionNode(s) && !isVirtualDesktopNode(s))

  // Register real desktop node IDs
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
  return (
    (preferredId != null ? servers.find((server) => server.id === preferredId) : undefined) ||
    servers.find((server) => isLocalDesktopNode(server) && server.isOnline) ||
    servers.find((server) => isLocalDesktopNode(server)) ||
    servers.find((server) => server.isActive) ||
    servers.find((server) => server.isOnline) ||
    servers[0]
  )
}
