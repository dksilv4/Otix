export type MessageContentType = 'text' | 'entity_embed' | 'attachment'

export interface ChatUserSummary {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface EntityEmbedMetadata {
  entityType: 'game' | 'movie' | 'show' | 'person' | 'list'
  entityId: number | string
  title: string
  coverUrl?: string
  posterUrl?: string
  releaseYear?: string | number
  rating?: number
  slug?: string
}

export interface MessageAttachment {
  id: number
  fileName: string
  fileUrl: string
  contentType: string
  fileSize: number
  createdAt: string
}

export interface MessageReaction {
  id: number
  userId: number
  username: string
  emoji: string
  createdAt: string
}

export interface ChatMessage {
  id: number
  conversationId: string
  sender: ChatUserSummary
  content: string
  contentType: MessageContentType
  metadata: Record<string, unknown>
  isDeleted: boolean
  editedAt: string | null
  createdAt: string
  attachments: MessageAttachment[]
  reactions: MessageReaction[]
  isOptimistic?: boolean
}

export interface ConversationParticipant {
  id: number
  user: ChatUserSummary
  joinedAt: string
  lastReadAt: string | null
  lastReadMessageId: number | null
  isMuted: boolean
  isArchived: boolean
}

export interface Conversation {
  id: string
  type: 'direct' | 'group'
  title: string
  createdAt: string
  updatedAt: string
  partner: ChatUserSummary | null
  participants: ConversationParticipant[]
  lastMessage: ChatMessage | null
  unreadCount: number
  isFriend: boolean
}

export interface SendMessagePayload {
  content?: string
  contentType?: MessageContentType
  metadata?: Record<string, unknown>
  attachments?: Array<{
    fileName: string
    fileUrl: string
    contentType: string
    fileSize: number
  }>
}

export interface ChatUnreadCount {
  count: number
}

export interface ChatEventPayload {
  conversationId: string
  messageId?: number
  senderId?: number
  senderUsername?: string
  senderDisplayName?: string
  senderAvatarUrl?: string | null
  content?: string
  snippet?: string
  contentType?: MessageContentType
  metadata?: Record<string, unknown>
  createdAt?: string
  editedAt?: string
  userId?: number
  username?: string
  emoji?: string
  added?: boolean
  lastReadMessageId?: number
}
