import { findPresetById, findPresetByGameTitle } from './presets'
import type { DedicatedGameServer } from '../types'

export interface SteamConnectionInfo {
  steamAppId?: string | number
  steamPort: number
  steamConnectAddress: string
  steamRunUrl: string | null
  steamBrowserUrl: string
  steamJoinUrl: string
}

export const getSteamConnectionInfo = (server: DedicatedGameServer): SteamConnectionInfo => {
  const matchedPreset =
    (server.mediaItemId ? findPresetById(server.mediaItemId) : undefined) ??
    (server.gameTitle ? findPresetByGameTitle(server.gameTitle) : undefined)

  const steamAppId = matchedPreset?.steamAppId

  const steamPort =
    server.queryPort ??
    (matchedPreset?.queryPortOffset != null
      ? server.port + matchedPreset.queryPortOffset
      : (matchedPreset?.defaultQueryPort ?? server.port))

  const steamConnectAddress = `${server.host}:${steamPort}`

  // steam://run/<appId>//+connect tells Steam to launch the game client directly with +connect,
  // bypassing the server browser App ID validation which fails on dedicated server tool IDs.
  const steamRunUrl = steamAppId
    ? `steam://run/${steamAppId}//+connect%20${server.host}:${server.port}${
        server.password ? `%20+password%20${encodeURIComponent(server.password)}` : ''
      }`
    : null

  const steamBrowserUrl = `steam://connect/${steamConnectAddress}${
    server.password ? `/${encodeURIComponent(server.password)}` : ''
  }`

  const steamJoinUrl = steamRunUrl ?? steamBrowserUrl

  return {
    steamAppId,
    steamPort,
    steamConnectAddress,
    steamRunUrl,
    steamBrowserUrl,
    steamJoinUrl,
  }
}
