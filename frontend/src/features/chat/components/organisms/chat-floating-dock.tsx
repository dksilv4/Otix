import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { useChatDock } from '../../hooks/use-chat-dock'
import { useConversationsQuery } from '../../queries'
import { ChatConversationView } from './chat-conversation-view'
import { ChatConversationsPanel } from './chat-conversations-panel'

export const ChatFloatingDock = () => {
  const { isAuthenticated } = useAuth()
  const {
    isOpen,
    setIsOpen,
    activeConversationId,
    setActiveConversationId,
    closeChat,
    typingUsers,
  } = useChatDock()

  const { data: conversations = [] } = useConversationsQuery()

  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
  }, [conversations])

  // Don't render dock if user is not authenticated
  if (!isAuthenticated) return null

  const activeTyping = activeConversationId ? typingUsers[activeConversationId] || [] : []

  return (
    <div className="fixed bottom-4 right-4 z-[9990] pointer-events-auto select-none">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="chat-dock-expanded"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-[92vw] sm:w-[380px] h-[520px] max-h-[82vh] rounded-2xl bg-[var(--dk-surface-overlay)] border border-white/[0.06] shadow-[var(--dk-shadow-dialog)] backdrop-blur-2xl overflow-hidden flex flex-col"
          >
            {activeConversationId ? (
              <ChatConversationView
                conversationId={activeConversationId}
                onBack={() => setActiveConversationId(null)}
                onClose={closeChat}
                typingUsernames={activeTyping}
              />
            ) : (
              <ChatConversationsPanel
                activeConversationId={activeConversationId}
                onSelectConversation={(id) => setActiveConversationId(id)}
                onClose={closeChat}
              />
            )}
          </motion.div>
        ) : (
          <motion.button
            key="chat-dock-pill"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[var(--dk-surface-overlay)] border border-white/[0.06] shadow-[var(--dk-shadow-dialog)] backdrop-blur-2xl text-foreground hover:bg-[var(--dk-surface-glass)] transition cursor-pointer group"
          >
            <div className="relative flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
              {totalUnread > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold tracking-wide">Chat</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
};
