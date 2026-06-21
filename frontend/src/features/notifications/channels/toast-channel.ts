import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

interface ToastFn {
  (opts: { title: string; description?: string; variant?: string }): void
}

export function createToastChannel(
  prefs: NotificationPreferences,
  showToast: ToastFn,
): Channel {
  return {
    name: 'toast',
    canDeliver: (event: NotificationEvent) => {
      return prefs[event.type] !== false
    },
    deliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return
      showToast({ title: event.title, description: event.body ?? undefined })
    },
  }
}
