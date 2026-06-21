import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

export function createWebChannel(prefs: NotificationPreferences): Channel {
  return {
    name: 'web',
    canDeliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return false
      if (prefs._web_enabled === false) return false
      if (typeof Notification === 'undefined') return false
      if (Notification.permission !== 'granted') return false
      if (document.visibilityState !== 'visible') return false
      return true
    },
    deliver: (event: NotificationEvent) => {
      const notification = new Notification(event.title, {
        body: event.body ?? undefined,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    },
  }
}
