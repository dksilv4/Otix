import { useContext, useCallback } from 'react'
import { ChatContext, type ChatContextValue } from '../providers/chat-context-def'
import { PanelContext } from '@activity/providers/panel-context'

export const useChatDock = (): ChatContextValue => {
  const context = useContext(ChatContext)
  const panelContext = useContext(PanelContext)

  const openConversationInNav = useCallback(
    (id: string) => {
      panelContext?.setUserMenuOpen(false)
      context?.setActiveConversationId(id)
      panelContext?.setChatOpen(true)
    },
    [context, panelContext],
  )

  const toggleChatInNav = useCallback(() => {
    if (panelContext) {
      panelContext.setChatOpen(!panelContext.isChatOpen)
    }
  }, [panelContext])

  const closeChatInNav = useCallback(() => {
    panelContext?.setChatOpen(false)
  }, [panelContext])

  if (!context) {
    return {
      activeConversationId: null,
      setActiveConversationId: () => {},
      openConversation: openConversationInNav,
      toggleChat: toggleChatInNav,
      closeChat: closeChatInNav,
    } as unknown as ChatContextValue
  }

  return {
    ...context,
    openConversation: openConversationInNav,
    toggleChat: toggleChatInNav,
    closeChat: closeChatInNav,
  }
}
