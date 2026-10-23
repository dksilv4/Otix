import { useState, useMemo } from 'react'
import { MessageSquare, Search, X, Users, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { ConversationListItem } from '../molecules/conversation-list-item'
import { useConversationsQuery } from '../../queries'

interface ChatConversationsPanelProps {
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onClose?: () => void
  isEmbeddedInPage?: boolean
}

export const ChatConversationsPanel = ({
  activeConversationId,
  onSelectConversation,
  onClose,
  isEmbeddedInPage: _isEmbeddedInPage = false,
}: ChatConversationsPanelProps) => {
  const [search, setSearch] = useState('')
  const { data: conversations = [], isLoading } = useConversationsQuery()

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

  return (
    <div className="flex flex-col h-full bg-[var(--dk-surface-base)]/60 border-r border-white/[0.04]">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--dk-surface-overlay)]/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">Messages</h3>
          {totalUnread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
              {totalUnread}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Link
            to="/friends"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
            title="Friends Hub"
          >
            <Users className="w-4 h-4" />
          </Link>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
              title="Close messages"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Apple-style Search Input */}
      <div className="px-3 pt-1 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-full bg-[var(--dk-surface-ghost)] pl-8.5 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/40 transition-all border border-white/[0.04]"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading chats...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground font-medium">
              {search.trim() ? 'No chats match your search' : 'No active conversations yet'}
            </p>
            <Link
              to="/friends"
              className="mt-3 text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Chat with a friend</span>
            </Link>
          </div>
        ) : (
          filteredConversations.map((c) => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              isSelected={c.id === activeConversationId}
              onClick={() => onSelectConversation(c.id)}
            />
          ))
        )}
      </div>
    </div>
  )
};
