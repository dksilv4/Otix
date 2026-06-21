import { getDesktopAPI } from '@/lib/desktop/api'
import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

export function createDesktopChannel(prefs: NotificationPreferences): Channel | null {
  const api = getDesktopAPI()

  if (!api?.showNotification) return null

  return {
    name: 'desktop',
    canDeliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return false
      if (prefs._desktop_enabled === false) return false
      return true
    },
    deliver: (event: NotificationEvent) => {
      api.showNotification!({
        title: event.title,
        body: event.body ?? undefined,
        type: event.type,
        metadata: event.metadata,
      })
    },
  }
}
