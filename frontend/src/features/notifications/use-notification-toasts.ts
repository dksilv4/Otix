import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api-client'

const ACCESS_TOKEN_KEY = 'otix-access-token'
const RECONNECT_DELAYS = [3000, 10000, 30000]

interface NotificationEvent {
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
  const esRef = useRef<EventSource | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsRef = useRef(user?.notificationPreferences ?? null)
  prefsRef.current = user?.notificationPreferences ?? null

  const connect = useCallback(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return

    const url = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (event) => {
      reconnectAttemptRef.current = 0
      try {
        const n: NotificationEvent = JSON.parse(event.data)
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        const prefs = prefsRef.current
        if (prefs && prefs[n.type] === false) return
        toast({
          title: n.title,
          description: n.body ?? undefined,
          variant: notificationVariant(n.type),
        })
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null

      const attempt = reconnectAttemptRef.current
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
      reconnectAttemptRef.current = attempt + 1

      reconnectTimerRef.current = setTimeout(() => {
        connect()
      }, delay)
    }
  }, [toast, queryClient])

  useEffect(() => {
    if (!isAuthenticated) {
      esRef.current?.close()
      esRef.current = null
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      reconnectAttemptRef.current = 0
      return
    }

    connect()

    return () => {
      esRef.current?.close()
      esRef.current = null
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }
  }, [isAuthenticated, connect])
}
