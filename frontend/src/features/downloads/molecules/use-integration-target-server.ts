import { useGameServers } from '../use-server-downloads'

export function useIntegrationTargetServer(serverId?: number, serverName?: string) {
  const { data: servers = [] } = useGameServers()
  const effectiveServer = serverId
    ? servers.find((s) => s.id === serverId) || (serverId ? { id: serverId, name: serverName } : undefined)
    : servers[0]
  const targetServerId = effectiveServer?.id || serverId
  const targetServerName = effectiveServer?.name || serverName || 'Local Game Server'
  return { targetServerId, targetServerName, servers }
}
