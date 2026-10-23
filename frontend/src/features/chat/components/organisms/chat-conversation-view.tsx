import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Maximize2, X, MessageSquare } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { DkAvatar } from '@ui/atoms/avatar'
import { ChatBubble } from '../molecules/chat-bubble'
import { ChatInput } from '../molecules/chat-input'
import { ChatTypingIndicator } from '../atoms/chat-typing-indicator'
import { ShareEntityModal } from '../modals/share-entity-modal'
import { useChatThread } from '../../hooks/use-chat-thread'
import { useAuth } from '@/lib/providers/auth'
import type { EntityEmbedMetadata } from '../../types'

interface ChatConversationViewProps {
  conversationId: string
  onBack?: () => void
  onClose?: () => void
  typingUsernames?: string[]
  isEmbeddedInPage?: boolean
}

export const ChatConversationView = ({
  conversationId,
  onBack,
  onClose,
  typingUsernames = [],
  isEmbeddedInPage = false,
}: ChatConversationViewProps) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    conversation,
    messages,
    isLoading,
    isSending,
    isFriend,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    notifyTyping,
  } = useChatThread(conversationId)

  const partner = conversation?.partner
  const title = conversation?.title || partner?.displayName || partner?.username || 'Chat'
  const currentUserId = user?.id ? Number(user.id) : 0

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSendEntity = async (entity: EntityEmbedMetadata) => {
    await sendMessage('', {
      contentType: 'entity_embed',
      metadata: entity as unknown as Record<string, unknown>,
    })
  }

  const handleOpenFullPage = () => {
    if (onClose) onClose()
    navigate({ to: '/messages', search: { conversationId } as Record<string, unknown> })
  }

  return (
    <div className="flex flex-col h-full bg-transparent relative overflow-hidden select-text">
      {/* Apple-style Floating Conversation Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[var(--dk-surface-overlay)]/40 backdrop-blur-2xl shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground rounded-xl transition cursor-pointer md:hidden"
              title="Back to conversations"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <DkAvatar
            src={partner?.avatarUrl}
            name={title}
            size="sm"
            className="shrink-0 !w-8.5 !h-8.5"
          />

          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-foreground truncate tracking-[-0.01em]">
              {title}
            </h4>
            <p className="text-[11px] text-muted-foreground/75 truncate">
              {!isFriend
                ? 'Read-only archive'
                : partner?.username
                  ? `@${partner.username}`
                  : 'Direct conversation'}
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isEmbeddedInPage && (
            <button
              type="button"
              onClick={handleOpenFullPage}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
              title="Open full page"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-[var(--dk-surface-ghost)] flex items-center justify-center text-primary mb-3 shadow-xs">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h4 className="text-[14px] font-semibold text-foreground">Direct Conversation</h4>
            <p className="text-[12px] text-muted-foreground mt-0.5 max-w-[240px]">
              Send a message or share a game to start hanging out!
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              isOutgoing={msg.sender.id === currentUserId}
              currentUserId={currentUserId}
              onReact={(emoji) => toggleReaction(msg.id, emoji)}
              onEdit={(msgId, content) => editMessage(msgId, content)}
              onDelete={(msgId) => deleteMessage(msgId)}
            />
          ))
        )}

        <ChatTypingIndicator usernames={typingUsernames} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-4 pb-4 pt-1 shrink-0">
        <ChatInput
          isFriend={isFriend}
          isSending={isSending}
          onSend={(content, options) => sendMessage(content, options)}
          onTyping={notifyTyping}
          onOpenShareEntity={() => setIsShareModalOpen(true)}
        />
      </div>

      {/* Share Entity Picker Modal */}
      <ShareEntityModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        onSelectEntity={handleSendEntity}
      />
    </div>
  )
};
