export const chatKeys = {
  all: ['chat'] as const,
  unreadCount: () => [...chatKeys.all, 'unread-count'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...chatKeys.all, 'conversation', id] as const,
  messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
}
