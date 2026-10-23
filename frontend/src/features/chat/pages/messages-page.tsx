import { useState, useEffect, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearch, useNavigate, Link } from '@tanstack/react-router'
import { MessageSquare, Users, Search, X, Plus, Loader2 } from 'lucide-react'
import { DkAvatar } from '@ui/atoms/avatar'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { ConversationListItem } from '../components/molecules/conversation-list-item'
import { ChatConversationView } from '../components/organisms/chat-conversation-view'
import { useChatDock } from '../hooks/use-chat-dock'
import { useConversationsQuery, useCreateConversationMutation } from '../queries'
import { useFriends } from '@/features/friends/hooks/use-friends'

export const MessagesPage = () => {
  const { isDesktop } = useDesktopPlatform()
  const searchParams = useSearch({ strict: false }) as { conversationId?: string }
  const navigate = useNavigate()
  const { typingUsers } = useChatDock()
  const { data: conversations = [], isLoading } = useConversationsQuery()
  const { activeNowFriends } = useFriends()
  const createConvMutation = useCreateConversationMutation()

  const [search, setSearch] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    searchParams.conversationId || null,
  )

  useEffect(() => {
    if (searchParams.conversationId) {
      setSelectedConversationId(searchParams.conversationId)
    }
  }, [searchParams.conversationId])

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id)
    navigate({ to: '/messages', search: { conversationId: id } as any })
  }

  const handleStartChatWithFriend = async (friendId: number) => {
    try {
      const conv = await createConvMutation.mutateAsync(friendId)
      handleSelectConversation(conv.id)
    } catch {
      // Handled silently
    }
  }

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const partnerName = (c.partner?.displayName || c.partner?.username || c.title || '').toLowerCase()
      return partnerName.includes(q)
    })
  }, [conversations, search])

  const activeTyping = selectedConversationId
    ? typingUsers[selectedConversationId] || []
    : []

  // Ensure content never overlaps or goes under the floating navigation pills
  const topPaddingClass = isDesktop ? 'pt-[116px]' : 'pt-[84px]'

  return (
    <div className={`h-screen w-full ${topPaddingClass} pb-4 px-0 flex gap-3 sm:gap-4 overflow-hidden select-none`}>
      <Helmet>
        <title>Messages — Otix</title>
      </Helmet>

      {/* Left Column: Floating Search Bar & Floating Chat Cards */}
      <div
        className={`w-full md:w-80 lg:w-96 shrink-0 h-full flex flex-col gap-2.5 overflow-hidden pl-3 sm:pl-4 ${
          selectedConversationId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Floating Search Capsule Bar */}
        <div className="relative rounded-2xl bg-[var(--dk-surface-overlay)]/75 backdrop-blur-2xl border border-white/[0.06] shadow-[var(--dk-shadow-glass)] px-3.5 py-2.5 mx-1 flex items-center gap-2.5 shrink-0 transition-all focus-within:ring-1 focus-within:ring-primary/40">
          <Search className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none leading-relaxed"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="p-1 text-muted-foreground hover:text-foreground rounded-full transition cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <Link
            to="/friends"
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition shrink-0 cursor-pointer"
            title="Friends Hub"
          >
            <Users className="w-4 h-4" />
          </Link>
        </div>

        {/* Active Now Friends Floating Strip */}
        {activeNowFriends.length > 0 && (
          <div className="rounded-2xl bg-[var(--dk-surface-overlay)]/50 backdrop-blur-xl border border-white/[0.05] p-2 mx-1 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 shadow-xs">
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
        )}

        {/* Floating Chat Cards Column with internal horizontal padding to prevent border/shadow clipping */}
        <div className="flex-1 overflow-y-auto space-y-2 px-1 py-1.5 scrollbar-thin">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto mb-2" />
              <span>Loading chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="rounded-2xl bg-[var(--dk-surface-overlay)]/50 backdrop-blur-xl border border-white/[0.05] p-6 text-center flex flex-col items-center justify-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs font-semibold text-foreground">
                {search.trim() ? 'No chats found' : 'No conversations yet'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {search.trim()
                  ? `No conversations match "${search}"`
                  : 'Start chatting with your friends.'}
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
                isSelected={c.id === selectedConversationId}
                onClick={() => handleSelectConversation(c.id)}
                floating
              />
            ))
          )}
        </div>
      </div>

      {/* Right Column: Floating Active Chat Island */}
      <div
        className={`flex-1 h-full min-w-0 rounded-3xl bg-[var(--dk-surface-overlay)]/50 backdrop-blur-2xl border border-white/[0.06] shadow-[var(--dk-shadow-dialog)] overflow-hidden flex flex-col mr-3 sm:mr-4 ${
          !selectedConversationId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedConversationId ? (
          <ChatConversationView
            conversationId={selectedConversationId}
            onBack={() => setSelectedConversationId(null)}
            typingUsernames={activeTyping}
            isEmbeddedInPage
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--dk-surface-ghost)] flex items-center justify-center mb-4 text-primary shadow-inner">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Select a conversation</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Choose an existing chat from the floating list or connect with friends to start a new direct message.
            </p>
            <Link
              to="/friends"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Go to Friends Hub</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
};
