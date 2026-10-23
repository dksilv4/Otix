import { useState, useCallback, useRef, type ReactNode } from 'react'
import { ChatContext } from './chat-context-def'
import { useChatSse } from '../hooks/use-chat-sse'

interface ChatProviderProps {
  children: ReactNode
}

export const ChatProvider = ({ children }: ChatProviderProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [typingMap, setTypingMap] = useState<Record<string, string[]>>({})
  const typingTimersRef = useRef<Record<string, number>>({})

  const openConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const registerTyping = useCallback((conversationId: string, username: string) => {
    const timerKey = `${conversationId}:${username}`
    if (typingTimersRef.current[timerKey]) {
      window.clearTimeout(typingTimersRef.current[timerKey])
    }

    setTypingMap((prev) => {
      const currentList = prev[conversationId] || []
      if (currentList.includes(username)) return prev
      return {
        ...prev,
        [conversationId]: [...currentList, username],
      }
    })

    typingTimersRef.current[timerKey] = window.setTimeout(() => {
      setTypingMap((prev) => {
        const currentList = prev[conversationId] || []
        return {
          ...prev,
          [conversationId]: currentList.filter((u) => u !== username),
        }
      })
      delete typingTimersRef.current[timerKey]
    }, 4000)
  }, [])

  // Hook in the SSE listener for background chat updates
  useChatSse({
    activeConversationId: isOpen ? activeConversationId : null,
    onTyping: registerTyping,
    onOpenConversation: openConversation,
  })

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        activeConversationId,
        setActiveConversationId,
        openConversation,
        closeChat,
        toggleChat,
        typingUsers: typingMap,
        registerTyping,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
};
