import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { gameServersApi } from '../api/gameservers-api'
import type { DedicatedGameServer, GameServerQueryResult } from '../types'

/**
 * Probe a game server directly from the user's PC via the Desktop Electron bridge.
 * Returns null when running in pure web browser mode without the desktop runtime.
 */
export async function probeServerFromClient(
  server: DedicatedGameServer,
  timeout = 4000,
): Promise<GameServerQueryResult | null> {
  if (!isDesktop()) {
    return null
  }

  const api = getDesktopAPI()
  if (!api?.queryGameServer) {
    return null
  }

  try {
    const result = await api.queryGameServer({
      host: server.host,
      port: server.port,
      queryPort: server.queryPort,
      serverType: server.serverType,
      timeout,
    })
    return (result as GameServerQueryResult) ?? null
  } catch {
    return null
  }
}

/**
 * Optimistically apply client probe metrics to a DedicatedGameServer record.
 */
export function applyProbeResultToGameServer(
  server: DedicatedGameServer,
  probe: GameServerQueryResult,
): DedicatedGameServer {
  const isOnline = probe.status === 'online'
  return {
    ...server,
    status: probe.status,
    pingMs: probe.pingMs ?? null,
    currentPlayers:
      probe.currentPlayers != null
        ? probe.currentPlayers
        : isOnline
          ? server.currentPlayers
          : 0,
    maxPlayers: probe.maxPlayers != null ? probe.maxPlayers : server.maxPlayers,
    playerList: probe.playerList ?? (isOnline ? server.playerList : []),
    currentMap: probe.currentMap ?? server.currentMap,
    version: probe.version ?? server.version,
    lastQueriedAt: new Date().toISOString(),
  }
}

/**
 * Refresh a single game server status.
 * If in Desktop mode, probes natively from the user's PC to measure real local ping
 * and live players/status, then synchronizes the probe result back to the server.
 * In web mode, falls back to querying through the backend.
 */
export async function refreshGameServerStatus(
  server: DedicatedGameServer,
  timeout = 4000,
): Promise<{ server: DedicatedGameServer; fromClient: boolean }> {
  const localResult = await probeServerFromClient(server, timeout)
  if (localResult) {
    try {
      const resp = await gameServersApi.query(server.id, localResult)
      return { server: resp.server, fromClient: true }
    } catch {
      // If network sync to backend fails, still return optimistic local update
      return {
        server: applyProbeResultToGameServer(server, localResult),
        fromClient: true,
      }
    }
  }

  // Fallback to backend live query
  const resp = await gameServersApi.query(server.id)
  return { server: resp.server, fromClient: false }
}
