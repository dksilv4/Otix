import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@ui/molecules/toast'
import { chatKeys } from '../queries/keys'
import { addChatEventListener, type ChatCustomEventDetail } from '../utils/events'
import { playMessageChime } from '../utils/audio'
import type { ChatMessage, Conversation } from '../types'

interface UseChatSseProps {
  activeConversationId: string | null
  onTyping: (conversationId: string, username: string) => void
  onOpenConversation: (conversationId: string) => void
}

export const useChatSse = ({
  activeConversationId,
  onTyping,
  onOpenConversation,
}: UseChatSseProps) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  useEffect(() => {
    const unsubscribe = addChatEventListener((detail: ChatCustomEventDetail) => {
      const { type, metadata } = detail
      if (!metadata || !metadata.conversationId) return

      const convId = metadata.conversationId

      if (type === 'chat.message_created') {
        const newMessage: ChatMessage = {
          id: metadata.messageId ?? Date.now(),
          conversationId: convId,
          sender: {
            id: metadata.senderId ?? 0,
            username: metadata.senderUsername ?? '',
            displayName: metadata.senderDisplayName ?? '',
            avatarUrl: metadata.senderAvatarUrl ?? null,
          },
          content: metadata.content ?? '',
          contentType: metadata.contentType ?? 'text',
          metadata: metadata.metadata ?? {},
          isDeleted: false,
          editedAt: null,
          createdAt: metadata.createdAt ?? new Date().toISOString(),
          attachments: [],
          reactions: [],
        }

        // 1. Update messages list query cache
        queryClient.setQueriesData<ChatMessage[]>(
          { queryKey: chatKeys.messages(convId) },
          (old) => {
            if (!old) return [newMessage]
            if (old.some((m) => m.id === newMessage.id)) return old
            return [...old, newMessage]
          },
        )

        // 2. Update conversation list preview & unread count
        const isCurrentlyViewing = activeConversationId === convId
        queryClient.setQueryData<Conversation[]>(chatKeys.conversations(), (old) => {
          if (!old) return old
          const target = old.find((c) => c.id === convId)
          const rest = old.filter((c) => c.id !== convId)

          if (!target) return old

          const updated: Conversation = {
            ...target,
            lastMessage: newMessage,
            updatedAt: newMessage.createdAt,
            unreadCount: isCurrentlyViewing ? 0 : target.unreadCount + 1,
          }
          return [updated, ...rest]
        })

        // Invalidate total unread count query
        queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() })

        // 3. Audio & Toast notification if not currently active
        if (!isCurrentlyViewing) {
          playMessageChime()
          toast({
            title: metadata.senderDisplayName || metadata.senderUsername || 'New Message',
            description: metadata.snippet || 'Sent a message',
            variant: 'default',
          })
        }
      } else if (type === 'chat.typing') {
        if (metadata.username) {
          onTyping(convId, metadata.username)
        }
      } else if (type === 'chat.message_edited') {
        queryClient.setQueriesData<ChatMessage[]>(
          { queryKey: chatKeys.messages(convId) },
          (old) => {
            if (!old) return old
            return old.map((m) =>
              m.id === metadata.messageId
                ? { ...m, content: metadata.content ?? m.content, editedAt: metadata.editedAt ?? m.editedAt }
                : m,
            )
          },
        )
      } else if (type === 'chat.message_deleted') {
        queryClient.setQueriesData<ChatMessage[]>(
          { queryKey: chatKeys.messages(convId) },
          (old) => {
            if (!old) return old
            return old.map((m) =>
              m.id === metadata.messageId ? { ...m, isDeleted: true, content: '' } : m,
            )
          },
        )
      } else if (type === 'chat.reaction_updated') {
        const { messageId, userId, emoji, added } = (metadata || {}) as {
          messageId?: number
          userId?: number
          emoji?: string
          added?: boolean
        }
        if (messageId && emoji && userId !== undefined) {
          queryClient.setQueriesData<ChatMessage[]>(
            { queryKey: chatKeys.messages(convId) },
            (old) => {
              if (!old) return old
              return old.map((m) => {
                if (m.id !== messageId) return m
                if (added) {
                  // One reaction per user: replace any previous reaction by this user or add new
                  const filtered = m.reactions.filter((r) => r.userId !== userId)
                  return {
                    ...m,
                    reactions: [
                      ...filtered,
                      {
                        id: Date.now(),
                        userId,
                        username: '',
                        emoji,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  }
                } else {
                  // Reaction removed for this user
                  return {
                    ...m,
                    reactions: m.reactions.filter((r) => r.userId !== userId),
                  }
                }
              })
            },
          )
        }
        queryClient.invalidateQueries({ queryKey: chatKeys.messages(convId) })
      } else if (type === 'chat.read') {
        queryClient.invalidateQueries({ queryKey: chatKeys.conversation(convId) })
      }
    })

    return unsubscribe
  }, [activeConversationId, onTyping, onOpenConversation, queryClient, toast])
}
