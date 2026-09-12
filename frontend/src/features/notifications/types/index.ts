import type { LucideIcon } from 'lucide-react'

export type NotificationType =
  | 'friend_request' | 'friend_accepted' | 'friend_rejected' | 'friend_removed'
  | 'follow' | 'follow_request' | 'follow_request_accepted'
  | 'list_invitation' | 'list_invitation_accepted' | 'list_invitation_declined'
  | 'user_rating' | 'like' | 'comment' | 'release_available'
  | 'new_season' | 'studio_release'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  metadataJson: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface UnreadCount {
  count: number
}

export interface NotificationListResponse {
  items: Notification[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ActionButton {
  label: string
  variant: 'primary' | 'secondary' | 'danger'
  onClick: () => void | Promise<void>
}

export interface ActionCallbacks {
  acceptFriendRequest: (requestId: string) => Promise<void>
  rejectFriendRequest: (requestId: string) => Promise<void>
  acceptListInvitation: (listId: string) => Promise<void>
  declineListInvitation: (listId: string) => Promise<void>
}

export interface TypeConfig {
  type: NotificationType
  icon: LucideIcon
  label: string
  description: string
  color: string
  getLink?: (n: Notification) => string | null
  getActions?: (n: Notification, cbs: ActionCallbacks) => ActionButton[]
  defaultChannels: {
    toast: boolean
    desktop: boolean
    web_push: boolean
  }
}

export interface NotificationEvent {
  id: string
  type: NotificationType
  title: string
  body: string | null
  metadata: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface Channel {
  readonly name: string
  canDeliver(event: NotificationEvent): boolean
  deliver(event: NotificationEvent): void | Promise<void>
}

export interface NotificationPreferences {
  [key: string]: boolean | string | undefined
  friend_request?: boolean
  friend_accepted?: boolean
  friend_rejected?: boolean
  friend_removed?: boolean
  follow?: boolean
  follow_request?: boolean
  follow_request_accepted?: boolean
  list_invitation?: boolean
  list_invitation_accepted?: boolean
  list_invitation_declined?: boolean
  user_rating?: boolean
  like?: boolean
  comment?: boolean
  release_available?: boolean
  new_season?: boolean
  studio_release?: boolean
  _desktop_enabled?: boolean
  _web_enabled?: boolean
  _pwa_enabled?: boolean
  _sound_enabled?: boolean
  _quiet_start?: string
  _quiet_end?: string
}
