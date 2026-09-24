import { isBackendNode } from '@/features/settings/backend-node'
import { isLocalDesktopNode } from '@/features/settings/local-desktop-node'
import type { GameServer } from '../types'
import { useGameServers } from '@/features/downloads/use-server-downloads'

/** Nodes that can store SABnzbd / *arr settings (workers + the Otix backend). */
export function remoteConnectionNodes(servers: GameServer[]): GameServer[] {
  return servers.filter((server) => !isLocalDesktopNode(server))
}

/** Worker machines only — Epic tokens and live downloaders do not run on the backend node. */
export function workerConnectionNodes(servers: GameServer[]): GameServer[] {
  return remoteConnectionNodes(servers).filter(
    (server) => !isBackendNode(server) && Number(server.id) > 0,
  )
}

export function pickConnectionNode(servers: GameServer[], preferredId?: number): GameServer | undefined {
  const remotes = remoteConnectionNodes(servers)
  const workers = workerConnectionNodes(servers)
  return (
    remotes.find((server) => server.id === preferredId) ||
    workers.find((server) => server.isOnline) ||
    workers[0] ||
    remotes.find((server) => isBackendNode(server)) ||
    remotes[0]
  )
}

export function connectionSyncLabel(servers: GameServer[], targetName?: string): string {
  const remotes = remoteConnectionNodes(servers)
  const name = targetName || remotes[0]?.name
  if (name) return `On ${name}`
  return 'Select an Otix node'
}

export function useIntegrationTargetServer(serverId?: number, serverName?: string) {
  const { data: servers = [] } = useGameServers()
  const effectiveServer = pickConnectionNode(servers, serverId) || (
    serverId != null && !isLocalDesktopNode({ id: serverId })
      ? { id: serverId, name: serverName }
      : undefined
  )
  const targetServerId =
    effectiveServer?.id ??
    (serverId != null && !isLocalDesktopNode({ id: serverId }) ? serverId : undefined)
  const targetServerName = effectiveServer?.name || serverName || 'Otix node'
  return {
    targetServerId,
    targetServerName,
    servers,
    remoteServers: remoteConnectionNodes(servers),
    syncLabel: connectionSyncLabel(servers, targetServerName),
  }
}
