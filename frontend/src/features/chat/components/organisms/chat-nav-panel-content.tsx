import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Search,
  Loader2,
  MessageSquare,
  Plus,
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { DkAvatar } from '@ui/atoms/avatar'
import { useAuth } from '@/lib/providers/auth'
import { useFriends } from '@/features/friends/hooks/use-friends'
import { useChatDock } from '../../hooks/use-chat-dock'
import { useConversationsQuery, useCreateConversationMutation } from '../../queries'
import { useChatThread } from '../../hooks/use-chat-thread'
import { ChatBubble } from '../molecules/chat-bubble'
import { ChatInput } from '../molecules/chat-input'
import { ConversationListItem } from '../molecules/conversation-list-item'
import { ChatTypingIndicator } from '../atoms/chat-typing-indicator'
import { ShareEntityModal } from '../modals/share-entity-modal'
import type { Conversation, EntityEmbedMetadata } from '../../types'

interface ChatNavPanelContentProps {
  onClose: () => void
}

export const ChatNavPanelContent = ({ onClose }: ChatNavPanelContentProps) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { activeConversationId, setActiveConversationId, typingUsers } = useChatDock()
  const { data: conversations = [], isLoading: isConvsLoading } = useConversationsQuery()
  const { friends, activeNowFriends } = useFriends()
  const createConvMutation = useCreateConversationMutation()

  const [search, setSearch] = useState('')
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const currentUserId = user?.id ? Number(user.id) : 0

  // Active thread data
  const {
    conversation: activeConv,
    messages,
    isLoading: isThreadLoading,
    isSending,
    isFriend,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    notifyTyping,
  } = useChatThread(activeConversationId)

  const activeTyping = activeConversationId ? typingUsers[activeConversationId] || [] : []

  // Auto-scroll to bottom of active thread
  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeConversationId, messages.length])

  // Filter conversations
  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const partnerName = (c.partner?.displayName || c.partner?.username || c.title || '').toLowerCase()
      return partnerName.includes(q)
    })
  }, [conversations, search])

  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
  }, [conversations])

  const handleStartChatWithFriend = async (friendId: number) => {
    try {
      const conv = await createConvMutation.mutateAsync(friendId)
      setActiveConversationId(conv.id)
    } catch {
      // Handled silently
    }
  }

  const handleOpenFullHub = () => {
    onClose()
    if (activeConversationId) {
      navigate({ to: '/messages', search: { conversationId: activeConversationId } as Record<string, unknown> })
    } else {
      navigate({ to: '/messages' })
    }
  }

  const handleSendEntity = async (entity: EntityEmbedMetadata) => {
    await sendMessage('', {
      contentType: 'entity_embed',
      metadata: entity as unknown as Record<string, unknown>,
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW B: Active Conversation View inside Dropdown
  // ──────────────────────────────────────────────────────────────────────────
  if (activeConversationId) {
    const partner = activeConv?.partner
    const title = activeConv?.title || partner?.displayName || partner?.username || 'Chat'

    return (
      <div className="flex flex-col h-[460px] select-text">
        {/* Thread Header: Soft, borderless navigation bar */}
        <div className="flex items-center justify-between pb-2 mb-1 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setActiveConversationId(null)}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
              title="Back to all conversations"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <DkAvatar
              src={partner?.avatarUrl}
              name={title}
              size="sm"
              className="shrink-0 !w-7 !h-7"
            />

            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-foreground truncate">{title}</h4>
              <p className="text-[10px] text-muted-foreground truncate">
                {!isFriend
                  ? 'Read-only archive'
                  : partner?.username
                    ? `@${partner.username}`
                    : 'Direct message'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleOpenFullHub}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
              title="Open full page"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Message Thread Scroll Area */}
        <div className="flex-1 overflow-y-auto px-1.5 py-3 space-y-1.5 scrollbar-thin">
          {isThreadLoading ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary mr-1.5" />
              <span>Loading messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-6">
              <DkAvatar
                src={partner?.avatarUrl}
                name={title}
                size="md"
                className="mb-2 !w-12 !h-12"
              />
              <p className="text-xs font-semibold text-foreground">Direct Conversation</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px]">
                Say hello to @{partner?.username} to start chatting!
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

          <ChatTypingIndicator usernames={activeTyping} />
          <div ref={messagesEndRef} />
        </div>

        {/* Apple-style Capsule Input Bar */}
        <div className="pt-1 mt-auto">
          <ChatInput
            isFriend={isFriend}
            isSending={isSending}
            onSend={(content, options) => sendMessage(content, options)}
            onTyping={notifyTyping}
            onOpenShareEntity={() => setIsShareModalOpen(true)}
          />
        </div>

        <ShareEntityModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          onSelectEntity={handleSendEntity}
        />
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW A: Conversations List & Friends Quick Launcher
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[460px]">
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-2 mb-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold text-foreground">Messages</h3>
          {totalUnread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
              {totalUnread}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleOpenFullHub}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Open Messages Dashboard"
        >
          <span>Full Hub</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Apple-style Quick Search Pill */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full rounded-full bg-[var(--dk-surface-ghost)] pl-8.5 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/40 transition-all border border-white/[0.04]"
        />
      </div>

      {/* Active Friends Quick Strip */}
      {activeNowFriends.length > 0 && (
        <div className="mb-2 px-0.5">
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {activeNowFriends.slice(0, 8).map(({ friend }) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => handleStartChatWithFriend(friend.id)}
                className="group relative flex flex-col items-center shrink-0 cursor-pointer"
                title={`Chat with @${friend.username}`}
              >
                <div className="relative">
                  <DkAvatar
                    src={friend.avatarUrl}
                    name={friend.username}
                    size="sm"
                    className="ring-1.5 ring-primary/40 group-hover:ring-primary transition-all !w-8 !h-8"
                  />
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-primary ring-2 ring-[var(--dk-surface-base)]" />
                </div>
                <span className="text-[10px] text-muted-foreground group-hover:text-foreground truncate max-w-[48px] mt-0.5">
                  {friend.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Cards List */}
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-1 scrollbar-thin">
        {isConvsLoading ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary mr-1.5" />
            <span>Loading conversations...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-44 text-center px-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-foreground font-semibold">
              {search.trim() ? 'No chats found' : 'No conversations yet'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {search.trim()
                ? `No conversations match "${search}"`
                : 'Connect with your friends to start chatting.'}
            </p>
            {friends.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-[260px]">
                {friends.slice(0, 4).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleStartChatWithFriend(f.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] px-2.5 py-1 text-[11px] text-foreground transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-primary" />
                    <span>@{f.username}</span>
                  </button>
                ))}
              </div>
            )}
            <Link
              to="/friends"
              onClick={onClose}
              className="mt-3 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Friends</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          filteredConversations.map((c: Conversation) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              isSelected={c.id === activeConversationId}
              onClick={() => setActiveConversationId(c.id)}
            />
          ))
        )}
      </div>
    </div>
  )
};
