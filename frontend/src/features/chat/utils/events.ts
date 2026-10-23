import type { ChatEventPayload } from '../types'

export const CHAT_EVENT_NAME = 'otix:chat_event'

export interface ChatCustomEventDetail {
  id: string
  type: string
  title: string
  body: string | null
  metadata: ChatEventPayload
  createdAt: string
}

export function dispatchChatEvent(detail: ChatCustomEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ChatCustomEventDetail>(CHAT_EVENT_NAME, { detail }))
}

export function addChatEventListener(
  handler: (detail: ChatCustomEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ChatCustomEventDetail>
    if (custom.detail) {
      handler(custom.detail)
    }
  }
  window.addEventListener(CHAT_EVENT_NAME, listener)
  return () => window.removeEventListener(CHAT_EVENT_NAME, listener)
}
