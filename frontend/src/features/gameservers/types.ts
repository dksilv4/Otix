export type GameServerType = 'steam_source' | 'minecraft' | 'generic'
export type GameServerStatus = 'online' | 'offline' | 'unknown'
export type GameServerPermission = 'viewer' | 'moderator' | 'admin'

export interface DedicatedGameServer {
  id: number
  name: string
  gameTitle: string
  mediaItemId?: string | null
  mediaItemTitle?: string | null
  mediaItemPoster?: string | null
  serverType: GameServerType
  host: string
  port: number
  queryPort?: number | null
  password?: string
  description?: string
  isPublicLink: boolean
  status: GameServerStatus
  currentPlayers: number
  maxPlayers: number
  playerList: string[]
  currentMap?: string
  version?: string
  pingMs?: number | null
  lastQueriedAt?: string | null
  connectionAddress: string
  ownerUsername: string
  isOwner: boolean
  userPermission: GameServerPermission
  activeInviteCode?: string | null
  createdAt: string
  updatedAt: string
}

export interface GameServerShare {
  id: number
  serverId: number
  user: {
    id: number
    username: string
    displayName?: string
    avatarUrl?: string | null
  }
  permission: GameServerPermission
  createdAt: string
}

export interface GameServerInvite {
  id: number
  code: string
  serverId: number
  isActive: boolean
  expiresAt?: string | null
  maxUses?: number | null
  uses: number
  isValid: boolean
  createdAt: string
}

export interface CreateGameServerPayload {
  name?: string
  gameTitle?: string
  mediaItemId?: string | null
  serverType: GameServerType
  host: string
  port: number
  queryPort?: number | null
  password?: string
  description?: string
  isPublicLink?: boolean
}

export type UpdateGameServerPayload = Partial<CreateGameServerPayload>

export interface FriendUser {
  id: number
  username: string
  displayName?: string
  avatarUrl?: string | null
}

export interface VerifyServerPayload {
  host: string
  port: number
  queryPort?: number | null
  serverType: GameServerType
}

export interface VerifyServerResult {
  status: 'online' | 'offline' | 'unknown'
  pingMs?: number | null
  currentPlayers?: number | null
  maxPlayers?: number | null
  currentMap?: string | null
  version?: string | null
  name?: string | null
  error?: string | null
  /** Present when TCP reachability succeeded but protocol query (A2S/MC) failed. */
  queryWarning?: string | null
}
