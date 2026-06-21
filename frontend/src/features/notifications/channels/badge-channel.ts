import type { Channel, NotificationEvent } from '../types'
import type { QueryClient } from '@tanstack/react-query'

export function createBadgeChannel(queryClient: QueryClient): Channel {
  return {
    name: 'badge',
    canDeliver: () => true,
    deliver: (_event: NotificationEvent) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  }
}
