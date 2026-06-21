import type { Channel, NotificationEvent } from '../types'

export function createPushChannel(): Channel {
  return {
    name: 'push',
    canDeliver: () => {
      return false
    },
    deliver: () => {
      // No-op — SW handles background delivery
    },
  }
}
