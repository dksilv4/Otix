import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

interface ToastFn {
  (opts: { title: string; description?: string; variant?: string; onClick?: () => void }): void
}

export function createToastChannel(
  prefs: NotificationPreferences,
  showToast: ToastFn,
  onNavigate?: (path: string) => void,
): Channel {
  return {
    name: 'toast',
    canDeliver: (event: NotificationEvent) => {
      return prefs[event.type] !== false
    },
    deliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return
      const rawLink = event.metadata?.link || (event as any).link
      const link = typeof rawLink === 'string' && rawLink.trim() ? rawLink.trim() : undefined

      showToast({
        title: event.title,
        description: event.body ?? undefined,
        onClick: link
          ? () => {
              if (onNavigate) {
                onNavigate(link)
              } else if (typeof window !== 'undefined') {
                window.location.href = link
              }
            }
          : undefined,
      })
    },
  }
}
