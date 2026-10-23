import { useMemo } from 'react'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { usePanelContext } from '@activity/providers/panel-context'
import { useChatUnreadCountQuery, useConversationsQuery } from '../../queries'

interface ChatNavButtonProps {
  onToggleChat?: () => void
}

export const ChatNavButton = ({ onToggleChat }: ChatNavButtonProps) => {
  const { isAuthenticated } = useAuth()
  const { isChatOpen, setChatOpen, isUserMenuOpen, setUserMenuOpen } = usePanelContext()
  const { data: unreadData } = useChatUnreadCountQuery()
  const { data: conversations = [] } = useConversationsQuery()

  const totalUnread = useMemo(() => {
    if (unreadData?.count !== undefined) {
      return unreadData.count
    }
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
  }, [unreadData, conversations])

  if (!isAuthenticated) return null

  const handleClick = () => {
    if (isUserMenuOpen) setUserMenuOpen(false)
    if (onToggleChat) {
      onToggleChat()
    } else {
      setChatOpen(!isChatOpen)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
        isChatOpen
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground'
      }`}
      title="Messages"
      aria-label="Messages"
    >
      <MessageSquare className="h-4 w-4" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  )
};
