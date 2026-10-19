import {
  Bell, UserPlus, UserCheck, UserX, UserMinus, Heart,
  MessageSquareText, Users, Star, Tv, Clapperboard,
  Unplug,
} from 'lucide-react'
import type { TypeConfig, NotificationType } from '../types'

export const NOTIFICATION_TYPES: Record<NotificationType, TypeConfig> = {
  friend_request: {
    type: 'friend_request',
    icon: UserPlus,
    label: 'Friend Request',
    description: 'Someone sent you a friend request',
    color: 'text-blue-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.senderUsername || meta.sender_username || meta.username) as string | undefined
      return username ? `/u/${username}` : '/friends'
    },
    getActions: (n, cbs) => {
      const requestId = n.metadataJson?.requestId ?? n.metadataJson?.request_id
      // Already accepted/declined — hide buttons so retries do not 400.
      if (requestId == null || n.metadataJson?.status) return []
      const id = String(requestId)
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptFriendRequest(id) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.rejectFriendRequest(id) },
      ]
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  friend_accepted: {
    type: 'friend_accepted',
    icon: UserCheck,
    label: 'Friend Request Accepted',
    description: 'A friend request was accepted',
    color: 'text-green-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (
        meta.username ||
        meta.receiverUsername ||
        meta.receiver_username ||
        meta.senderUsername ||
        meta.sender_username
      ) as string | undefined
      return username ? `/u/${username}` : '/friends'
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  friend_rejected: {
    type: 'friend_rejected',
    icon: UserX,
    label: 'Friend Request Declined',
    description: 'A friend request was declined',
    color: 'text-red-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.username || meta.receiverUsername || meta.receiver_username) as string | undefined
      return username ? `/u/${username}` : '/friends'
    },
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  friend_removed: {
    type: 'friend_removed',
    icon: UserMinus,
    label: 'Friend Removed',
    description: 'You were removed as a friend',
    color: 'text-red-400',
    getLink: (n) => {
      const username = n.metadataJson?.username as string | undefined
      return username ? `/u/${username}` : '/friends'
    },
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  follow: {
    type: 'follow',
    icon: UserPlus,
    label: 'New Follower',
    description: 'Someone followed you',
    color: 'text-blue-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.followerUsername || meta.follower_username || meta.username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  follow_request: {
    type: 'follow_request',
    icon: UserPlus,
    label: 'Follow Request',
    description: 'Someone requested to follow you',
    color: 'text-blue-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.requesterUsername || meta.requester_username || meta.username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  follow_request_accepted: {
    type: 'follow_request_accepted',
    icon: UserCheck,
    label: 'Follow Request Accepted',
    description: 'Your follow request was accepted',
    color: 'text-green-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.targetUsername || meta.target_username || meta.username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation: {
    type: 'list_invitation',
    icon: Users,
    label: 'List Invitation',
    description: 'You were invited to collaborate on a list',
    color: 'text-purple-400',
    getLink: (n) => {
      const listId = (n.metadataJson?.listId ?? n.metadataJson?.list_id) as string | number | undefined
      return listId != null ? `/library/${listId}` : '/library/lists'
    },
    getActions: (n, cbs) => {
      const listId = (n.metadataJson?.listId ?? n.metadataJson?.list_id) as string | number | undefined
      if (listId == null) return []
      const id = String(listId)
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptListInvitation(id) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.declineListInvitation(id) },
      ]
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation_accepted: {
    type: 'list_invitation_accepted',
    icon: Users,
    label: 'List Invitation Accepted',
    description: 'Someone accepted your list invitation',
    color: 'text-green-400',
    getLink: (n) => {
      const listId = (n.metadataJson?.listId ?? n.metadataJson?.list_id) as string | number | undefined
      return listId != null ? `/library/${listId}` : '/library/lists'
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation_declined: {
    type: 'list_invitation_declined',
    icon: Users,
    label: 'List Invitation Declined',
    description: 'Someone declined your list invitation',
    color: 'text-orange-400',
    getLink: (n) => {
      const listId = (n.metadataJson?.listId ?? n.metadataJson?.list_id) as string | number | undefined
      return listId != null ? `/library/${listId}` : '/library/lists'
    },
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  user_rating: {
    type: 'user_rating',
    icon: Star,
    label: 'New Rating',
    description: 'Someone rated your content',
    color: 'text-yellow-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const username = (meta.raterUsername || meta.rater_username || meta.username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  like: {
    type: 'like',
    icon: Heart,
    label: 'Like',
    description: 'Someone liked your content',
    color: 'text-rose-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const mediaType = (meta.mediaType || meta.media_type) as string | undefined
      const mediaId = (meta.mediaId ?? meta.media_id) as string | number | undefined
      if (mediaType && mediaId != null) return `/media/${mediaType}/${mediaId}`
      const username = (meta.username || meta.senderUsername || meta.sender_username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  comment: {
    type: 'comment',
    icon: MessageSquareText,
    label: 'Comment',
    description: 'Someone commented on your content',
    color: 'text-blue-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const mediaType = (meta.mediaType || meta.media_type) as string | undefined
      const mediaId = (meta.mediaId ?? meta.media_id) as string | number | undefined
      if (mediaType && mediaId != null) return `/media/${mediaType}/${mediaId}`
      const username = (meta.username || meta.senderUsername || meta.sender_username) as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  release_available: {
    type: 'release_available',
    icon: Bell,
    label: 'Now Available',
    description: 'A watchlisted item has a new release',
    color: 'text-emerald-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const mediaType = (meta.mediaType || meta.media_type) as string | undefined
      const mediaId = (meta.mediaId ?? meta.media_id) as string | number | undefined
      if (mediaType && mediaId != null) return `/media/${mediaType}/${mediaId}`
      return null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  new_season: {
    type: 'new_season',
    icon: Tv,
    label: 'New Season',
    description: 'When a show you have watched gets a new season',
    color: 'text-green-500',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const mediaType = (meta.mediaType || meta.media_type || 'show') as string
      const mediaId = (meta.mediaId ?? meta.media_id) as string | number | undefined
      if (mediaId != null) return `/media/${mediaType}/${mediaId}`
      return null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  studio_release: {
    type: 'studio_release',
    icon: Clapperboard,
    label: 'Studio release',
    description: 'A studio you follow has a new or upcoming title',
    color: 'text-violet-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const mediaType = (meta.mediaType || meta.media_type) as string | undefined
      const mediaId = (meta.mediaId ?? meta.media_id) as string | number | undefined
      if (mediaType && mediaId != null) return `/media/${mediaType}/${mediaId}`
      return null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  integration_disconnected: {
    type: 'integration_disconnected',
    icon: Unplug,
    label: 'Integration Disconnected',
    description: 'An external integration was disconnected',
    color: 'text-amber-400',
    getLink: () => '/settings/integrations',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  system: {
    type: 'system',
    icon: Bell,
    label: 'System Notification',
    description: 'System announcements and updates',
    color: 'text-amber-400',
    getLink: (n) => {
      const meta = n.metadataJson ?? {}
      const link = (meta.link || meta.url) as string | undefined
      return link || null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
}

export function getTypeConfig(type: NotificationType | string): TypeConfig | undefined {
  return NOTIFICATION_TYPES[type as NotificationType]
}

export function getTypeIcon(type: NotificationType | string) {
  return NOTIFICATION_TYPES[type as NotificationType]?.icon ?? Bell
}
