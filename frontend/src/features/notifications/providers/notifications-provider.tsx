import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useToast } from '@ui/molecules/toast'
import { useSseStream } from '@/lib/hooks/use-sse-stream'
import type { SseEvent } from '@/lib/api/sse-client'
import { NotificationRouter } from '../channels'
import { createBadgeChannel } from '../channels/badge-channel'
import { createSoundChannel } from '../channels/sound-channel'
import { createWebChannel } from '../channels/web-channel'
import { createToastChannel } from '../channels/toast-channel'
import { createDesktopChannel } from '../channels/desktop-channel'
import type { NotificationEvent, NotificationType, NotificationPreferences } from '../types'

interface NotificationsProviderProps {
  children: React.ReactNode
}

function isInQuietHours(prefs: NotificationPreferences): boolean {
  const start = prefs._quiet_start as string | undefined
  const end = prefs._quiet_end as string | undefined
  if (!start || !end) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (startMin <= endMin) return current >= startMin && current < endMin
  return current >= startMin || current < endMin
}

export function NotificationsProvider({ children }: NotificationsProviderProps) {
  const { isAuthenticated, user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const routerRef = useRef<NotificationRouter | null>(null)

  const rawPrefs = user?.notificationPreferences
  const prefs = useMemo(
    () => (rawPrefs ?? {}) as NotificationPreferences,
    [rawPrefs],
  )

  useEffect(() => {
    const router = new NotificationRouter()
    router.registerChannel(createBadgeChannel(queryClient))
    router.registerChannel(createSoundChannel(prefs))
    router.registerChannel(createWebChannel(prefs))
    router.registerChannel(createToastChannel(prefs, (opts) => {
      toast({ title: opts.title, description: opts.description, variant: 'default' })
    }))

    const desktopChannel = createDesktopChannel(prefs)
    if (desktopChannel) router.registerChannel(desktopChannel)
    routerRef.current = router
  }, [prefs, queryClient, toast])

  const handleMessage = useCallback(
    (event: SseEvent) => {
      // Convert snake_case SSE event to camelCase NotificationEvent
      const raw = event as Record<string, unknown>
      const n: NotificationEvent = {
        id: (raw.id as string) || '',
        type: (raw.type as NotificationType) || '',
        title: (raw.title as string) || '',
        body: (raw.body as string) ?? null,
        metadata: (raw.metadataJson ?? raw.metadata ?? {}) as Record<string, unknown>,
        isRead: (raw.isRead ?? raw.is_read ?? false) as boolean,
        createdAt: (raw.createdAt ?? raw.created_at ?? '') as string,
      }

      if (!n.id || !n.type) return

      if (prefs[n.type] === false) return
      if (isInQuietHours(prefs)) return

      routerRef.current?.route(n)
    },
    [prefs],
  )

  useSseStream({
    url: '/api/v1/notifications/stream',
    onMessage: handleMessage,
    enabled: isAuthenticated,
    reconnectDelays: [3000, 10000, 30000],
    initialDelayMs: 2000,
  })

  return <>{children}</>
}
