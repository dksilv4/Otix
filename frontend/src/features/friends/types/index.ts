export interface Friend {
  id: number
  username: string
  avatarUrl: string | null
  friendsSince: string | null
  lastLogin?: string | null
  totalXp?: number
  bio?: string | null
}

export interface FriendRequestUser {
  id: number
  username: string
  avatarUrl: string | null
  steamId?: string | null
  plexId?: string | null
  totalXp?: number
  bio?: string | null
}

export interface FriendRequest {
  id: number
  senderId: number
  receiverId: number
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  sender: FriendRequestUser
  receiver: FriendRequestUser
}

export interface FriendActivityMediaItem {
  id: string
  title: string
  mediaType: string
  posterUrl: string | null
}

export interface FriendActivityUser {
  id: number
  username: string
  avatarUrl: string | null
}

export interface FriendActivityEvent {
  type: 'review' | 'interaction' | 'episode_watched'
  timestamp: string
  summary: string
  score?: number | null
  content?: string | null
  interactionType?: string
  mediaItem?: FriendActivityMediaItem
  user: FriendActivityUser
}

export type FriendOnlineState = 'active_now' | 'active_today' | 'offline'

export interface ActiveFriend {
  friend: Friend
  state: FriendOnlineState
  stateLabel: string
  latestActivity?: FriendActivityEvent | null
}

export interface FriendshipStatus {
  status: 'friends' | 'pending_sent' | 'pending_received' | 'none'
  requestId: number | null
}

export type FriendsTabKey = 'all' | 'active' | 'activity' | 'requests'
export type ActivityFilterKey = 'all' | 'reviews' | 'watched' | 'interactions'
