import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { chatKeys } from './keys'
import type {
  Conversation,
  ChatMessage,
  MessageReaction,
  SendMessagePayload,
  ChatUnreadCount,
} from '../types'

export const chatQueries = {
  unreadCount: () =>
    queryOptions({
      queryKey: chatKeys.unreadCount(),
      queryFn: async (): Promise<ChatUnreadCount> => {
        const { data } = await apiClient.get<ChatUnreadCount>('/chat/unread-count')
        return data ?? { count: 0 }
      },
      staleTime: 1000 * 10,
    }),

  conversations: () =>
    queryOptions({
      queryKey: chatKeys.conversations(),
      queryFn: async (): Promise<Conversation[]> => {
        const { data } = await apiClient.get<Conversation[]>('/chat/conversations')
        return Array.isArray(data) ? data : []
      },
      staleTime: 1000 * 15,
    }),

  conversation: (conversationId: string) =>
    queryOptions({
      queryKey: chatKeys.conversation(conversationId),
      queryFn: async (): Promise<Conversation> => {
        const { data } = await apiClient.get<Conversation>(`/chat/conversations/${conversationId}`)
        return data
      },
      enabled: Boolean(conversationId),
      staleTime: 1000 * 30,
    }),

  messages: (conversationId: string, limit = 50, beforeId?: number) =>
    queryOptions({
      queryKey: [...chatKeys.messages(conversationId), { limit, beforeId }],
      queryFn: async (): Promise<ChatMessage[]> => {
        const { data } = await apiClient.get<ChatMessage[]>(
          `/chat/conversations/${conversationId}/messages`,
          { params: { limit, before_id: beforeId } },
        )
        return Array.isArray(data) ? data : []
      },
      enabled: Boolean(conversationId),
      staleTime: 1000 * 10,
    }),
}

export const useChatUnreadCountQuery = () => useQuery(chatQueries.unreadCount())

export const useConversationsQuery = () => useQuery(chatQueries.conversations())

export const useConversationQuery = (conversationId: string) =>
  useQuery(chatQueries.conversation(conversationId))

export const useMessagesQuery = (conversationId: string, limit = 50, beforeId?: number) =>
  useQuery(chatQueries.messages(conversationId, limit, beforeId))

export const useCreateConversationMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipientId: number): Promise<Conversation> => {
      const { data } = await apiClient.post<Conversation>('/chat/conversations', {
        recipientId,
      })
      return data
    },
    onSuccess: (newConv) => {
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations(), (old) => {
        if (!old) return [newConv]
        const exists = old.some((c) => c.id === newConv.id)
        if (exists) {
          return old.map((c) => (c.id === newConv.id ? newConv : c))
        }
        return [newConv, ...old]
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export const useSendMessageMutation = (conversationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SendMessagePayload): Promise<ChatMessage> => {
      const { data } = await apiClient.post<ChatMessage>(
        `/chat/conversations/${conversationId}/messages`,
        payload,
      )
      return data
    },
    onSuccess: (sentMessage) => {
      // Append sent message to messages cache
      queryClient.setQueriesData<ChatMessage[]>(
        { queryKey: chatKeys.messages(conversationId) },
        (old) => {
          if (!old) return [sentMessage]
          const filtered = old.filter((m) => m.id !== sentMessage.id && !m.isOptimistic)
          return [...filtered, sentMessage]
        },
      )
      // Update last message in conversation list
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations(), (old) => {
        if (!old) return old
        return old.map((c) => {
          if (c.id !== conversationId) return c
          return {
            ...c,
            lastMessage: sentMessage,
            updatedAt: sentMessage.createdAt,
          }
        })
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export const useEditMessageMutation = (conversationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: number; content: string }): Promise<ChatMessage> => {
      const { data } = await apiClient.patch<ChatMessage>(
        `/chat/conversations/${conversationId}/messages/${messageId}`,
        { content },
      )
      return data
    },
    onSuccess: (edited) => {
      queryClient.setQueriesData<ChatMessage[]>(
        { queryKey: chatKeys.messages(conversationId) },
        (old) => {
          if (!old) return old
          return old.map((m) => (m.id === edited.id ? edited : m))
        },
      )
    },
  })
}

export const useDeleteMessageMutation = (conversationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: number): Promise<ChatMessage> => {
      const { data } = await apiClient.delete<ChatMessage>(
        `/chat/conversations/${conversationId}/messages/${messageId}`,
      )
      return data
    },
    onSuccess: (deleted) => {
      queryClient.setQueriesData<ChatMessage[]>(
        { queryKey: chatKeys.messages(conversationId) },
        (old) => {
          if (!old) return old
          return old.map((m) => (m.id === deleted.id ? deleted : m))
        },
      )
    },
  })
}

export const useToggleReactionMutation = (
  conversationId: string,
  currentUser?: { id: number; username: string },
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const { data } = await apiClient.post<{
        status: string
        added: boolean
        emoji: string
        reactions?: MessageReaction[]
      }>(
        `/chat/conversations/${conversationId}/messages/${messageId}/reactions`,
        { emoji },
      )
      return data
    },
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(conversationId) })

      const previousMessages = queryClient.getQueryData<ChatMessage[]>([
        ...chatKeys.messages(conversationId),
        { limit: 50, beforeId: undefined },
      ])

      const userId = currentUser?.id ?? 0
      const username = currentUser?.username ?? ''

      queryClient.setQueriesData<ChatMessage[]>(
        { queryKey: chatKeys.messages(conversationId) },
        (old) => {
          if (!old) return old
          return old.map((m) => {
            if (m.id !== messageId) return m
            const userReaction = m.reactions.find((r) => r.userId === userId)
            let updatedReactions: MessageReaction[]
            if (userReaction) {
              if (userReaction.emoji === emoji) {
                // Same emoji clicked again: toggle off (remove)
                updatedReactions = m.reactions.filter((r) => r.userId !== userId)
              } else {
                // Different emoji clicked: swap to new emoji (one reaction per user)
                updatedReactions = m.reactions.map((r) =>
                  r.userId === userId ? { ...r, emoji } : r,
                )
              }
            } else {
              // Add new reaction
              updatedReactions = [
                ...m.reactions,
                {
                  id: Date.now(),
                  userId,
                  username,
                  emoji,
                  createdAt: new Date().toISOString(),
                },
              ]
            }
            return {
              ...m,
              reactions: updatedReactions,
            }
          })
        },
      )

      return { previousMessages }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueriesData<ChatMessage[]>(
          { queryKey: chatKeys.messages(conversationId) },
          context.previousMessages,
        )
      }
    },
    onSuccess: (data, { messageId }) => {
      if (data.reactions) {
        queryClient.setQueriesData<ChatMessage[]>(
          { queryKey: chatKeys.messages(conversationId) },
          (old) => {
            if (!old) return old
            return old.map((m) =>
              m.id === messageId ? { ...m, reactions: data.reactions! } : m,
            )
          },
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
    },
  })
}

export const useMarkConversationReadMutation = (conversationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lastReadMessageId?: number) => {
      const { data } = await apiClient.post<{ status: string; lastReadMessageId: number }>(
        `/chat/conversations/${conversationId}/read`,
        { lastReadMessageId },
      )
      return data
    },
    onSuccess: () => {
      // Clear unread count for this conversation in cache
      queryClient.setQueryData<Conversation[]>(chatKeys.conversations(), (old) => {
        if (!old) return old
        return old.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      })
      queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() })
    },
  })
}

export const useBroadcastTypingMutation = (conversationId: string) => {
  return useMutation({
    mutationFn: async () => {
      await apiClient.post(`/chat/conversations/${conversationId}/typing`)
    },
  })
}

export const useConversationSettingsMutation = (conversationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { isMuted?: boolean; isArchived?: boolean }) => {
      const { data } = await apiClient.patch(`/chat/conversations/${conversationId}/settings`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}
