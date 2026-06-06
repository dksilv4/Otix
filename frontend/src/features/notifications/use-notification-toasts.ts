// TODO: Review this file
import { useCallback } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api-client'
import { useSseStream } from '@/lib/use-sse-stream'
import type { SseEvent } from '@/lib/sse-client'

const RECONNECT_DELAYS = [3000, 10000, 30000]

interface NotificationEvent extends SseEvent {
  id: string
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

function notificationVariant(type: string): 'default' | 'success' | 'info' | 'warning' {
  if (type === 'friend_accepted') return 'success'
  if (type === 'friend_rejected' || type === 'friend_removed') return 'warning'
  if (type === 'friend_request' || type === 'list_invitation') return 'info'
  return 'default'
}

export function useNotificationToasts() {
  const { isAuthenticated, user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const handleMessage = useCallback((event: SseEvent) => {
    const n = event as NotificationEvent
    if (!n.id || !n.type) return

    queryClient.invalidateQueries({ queryKey: ['notifications'] })

    // Respect per-type notification preferences
    const prefs = user?.notificationPreferences ?? {}
    if (prefs[n.type] === false) return

    toast({
      title: n.title,
      description: n.body ?? undefined,
      variant: notificationVariant(n.type),
    })
  }, [queryClient, toast, user?.notificationPreferences])

  useSseStream({
    url: `${API_BASE_URL}/notifications/stream`,
    onMessage: handleMessage,
    enabled: isAuthenticated,
    reconnectDelays: RECONNECT_DELAYS,
  })
}
