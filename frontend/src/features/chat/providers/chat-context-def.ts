import { createContext } from 'react'

export interface ChatContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void
  openConversation: (id: string) => void
  closeChat: () => void
  toggleChat: () => void
  typingUsers: Record<string, string[]>
  registerTyping: (conversationId: string, username: string) => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)
