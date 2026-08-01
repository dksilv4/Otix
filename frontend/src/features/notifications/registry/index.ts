import {
  Bell, UserPlus, UserCheck, UserX, UserMinus, Heart,
  MessageSquareText, Users, Star, Tv,
} from 'lucide-react'
import type { TypeConfig, NotificationType } from '../types'

export const NOTIFICATION_TYPES: Record<NotificationType, TypeConfig> = {
  friend_request: {
    type: 'friend_request',
    icon: UserPlus,
    label: 'Friend Request',
    description: 'Someone sent you a friend request',
    color: 'text-blue-400',
    getActions: (n, cbs) => {
      const requestId = n.metadataJson.requestId as string | undefined
      if (!requestId) return []
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptFriendRequest(requestId) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.rejectFriendRequest(requestId) },
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
      const username = n.metadataJson.username as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  friend_rejected: {
    type: 'friend_rejected',
    icon: UserX,
    label: 'Friend Request Declined',
    description: 'A friend request was declined',
    color: 'text-red-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  friend_removed: {
    type: 'friend_removed',
    icon: UserMinus,
    label: 'Friend Removed',
    description: 'You were removed as a friend',
    color: 'text-red-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  follow: {
    type: 'follow',
    icon: UserPlus,
    label: 'New Follower',
    description: 'Someone followed you',
    color: 'text-blue-400',
    getLink: (n) => {
      const username = n.metadataJson.followerUsername as string | undefined
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
      const username = n.metadataJson.requesterUsername as string | undefined
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
      const username = n.metadataJson.targetUsername as string | undefined
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
    getActions: (n, cbs) => {
      const listId = n.metadataJson.listId as string | undefined
      if (!listId) return []
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptListInvitation(listId) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.declineListInvitation(listId) },
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
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation_declined: {
    type: 'list_invitation_declined',
    icon: Users,
    label: 'List Invitation Declined',
    description: 'Someone declined your list invitation',
    color: 'text-orange-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  user_rating: {
    type: 'user_rating',
    icon: Star,
    label: 'New Rating',
    description: 'Someone rated your content',
    color: 'text-yellow-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  like: {
    type: 'like',
    icon: Heart,
    label: 'Like',
    description: 'Someone liked your content',
    color: 'text-rose-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  comment: {
    type: 'comment',
    icon: MessageSquareText,
    label: 'Comment',
    description: 'Someone commented on your content',
    color: 'text-blue-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  release_available: {
    type: 'release_available',
    icon: Bell,
    label: 'Now Available',
    description: 'A watchlisted item has a new release',
    color: 'text-emerald-400',
    getLink: (n) => {
      const slug = n.metadataJson.mediaSlug as string | undefined
      return slug ? `/media/${slug}` : null
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
      const slug = n.metadataJson.mediaSlug as string | undefined
      return slug ? `/media/${slug}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
}

export function getTypeConfig(type: NotificationType) {
  return NOTIFICATION_TYPES[type]
}

export function getTypeIcon(type: NotificationType) {
  return NOTIFICATION_TYPES[type]?.icon ?? Bell
}
