import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/providers/auth'
import {
  useMessagesQuery,
  useConversationQuery,
  useSendMessageMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useToggleReactionMutation,
  useMarkConversationReadMutation,
  useBroadcastTypingMutation,
} from '../queries'
import type { MessageContentType } from '../types'

export const useChatThread = (conversationId: string | null) => {
  const { user } = useAuth()
  const convId = conversationId || ''
  const currentUserId = user?.id ? Number(user.id) : 0
  const currentUsername = user?.username || ''

  const { data: conversation, isLoading: isConvLoading } = useConversationQuery(convId)
  const { data: messages = [], isLoading: isMessagesLoading } = useMessagesQuery(convId)

  const sendMutation = useSendMessageMutation(convId)
  const editMutation = useEditMessageMutation(convId)
  const deleteMutation = useDeleteMessageMutation(convId)
  const reactionMutation = useToggleReactionMutation(
    convId,
    user ? { id: currentUserId, username: currentUsername } : undefined,
  )
  const markReadMutation = useMarkConversationReadMutation(convId)
  const typingMutation = useBroadcastTypingMutation(convId)

  const lastTypingTimeRef = useRef<number>(0)

  // Mark conversation read on mount / when new messages arrive
  useEffect(() => {
    if (!convId || messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && !lastMsg.isOptimistic) {
      markReadMutation.mutate(lastMsg.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, messages.length])

  const notifyTyping = useCallback(() => {
    if (!convId) return
    const now = Date.now()
    if (now - lastTypingTimeRef.current > 3000) {
      lastTypingTimeRef.current = now
      typingMutation.mutate()
    }
  }, [convId, typingMutation])

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        contentType?: MessageContentType
        metadata?: Record<string, unknown>
        attachments?: Array<{
          fileName: string
          fileUrl: string
          contentType: string
          fileSize: number
        }>
      },
    ) => {
      if (!convId) return
      await sendMutation.mutateAsync({
        content,
        contentType: options?.contentType || 'text',
        metadata: options?.metadata || {},
        attachments: options?.attachments || [],
      })
    },
    [convId, sendMutation],
  )

  const editMessage = useCallback(
    async (messageId: number, content: string) => {
      if (!convId) return
      await editMutation.mutateAsync({ messageId, content })
    },
    [convId, editMutation],
  )

  const deleteMessage = useCallback(
    async (messageId: number) => {
      if (!convId) return
      await deleteMutation.mutateAsync(messageId)
    },
    [convId, deleteMutation],
  )

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      if (!convId) return
      try {
        await reactionMutation.mutateAsync({ messageId, emoji })
      } catch (err) {
        console.error('Failed to toggle reaction', err)
      }
    },
    [convId, reactionMutation],
  )

  return {
    conversation,
    messages,
    isLoading: isConvLoading || isMessagesLoading,
    isSending: sendMutation.isPending,
    isFriend: conversation?.isFriend ?? true,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    notifyTyping,
  }
}
