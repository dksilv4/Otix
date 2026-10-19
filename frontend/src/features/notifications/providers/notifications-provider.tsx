import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useToast } from '@ui/molecules/toast'
import { useSseStream } from '@/lib/hooks/use-sse-stream'
import type { SseEvent } from '@/lib/api/sse-client'
import { NotificationRouter } from '../channels'
import { createSoundChannel } from '../channels/sound-channel'
import { createWebChannel } from '../channels/web-channel'
import { createToastChannel } from '../channels/toast-channel'
import { createDesktopChannel } from '../channels/desktop-channel'
import type {
  NotificationEvent,
  NotificationType,
  NotificationPreferences,
} from '../types'

import { convertKeysToCamelCase } from '@/lib/api/client'
import {
  isInQuietHours,
  appendNotificationToFeed,
  bumpUnreadCount,
} from '../utils'

interface NotificationsProviderProps {
  children: React.ReactNode
}

export const NotificationsProvider = ({ children }: NotificationsProviderProps) => {
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
    // Unread badge is updated in handleMessage (cache-only). Do not register a
    // badge channel that invalidates/refetches the list.
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
      const raw = event as Record<string, unknown>
      const rawMeta = (raw.metadataJson ?? raw.metadata ?? raw.metadata_json ?? {}) as Record<string, unknown>
      const meta = (convertKeysToCamelCase(rawMeta) || {}) as Record<string, unknown>
      const n: NotificationEvent = {
        id: String((raw.id as string | number) || ''),
        type: (raw.type as NotificationType) || '',
        title: (raw.title as string) || '',
        body: (raw.body as string) ?? null,
        metadata: meta,
        isRead: (raw.isRead ?? raw.is_read ?? false) as boolean,
        createdAt: (raw.createdAt ?? raw.created_at ?? '') as string,
      }

      if (!n.id || !n.type) return

      const outcome = appendNotificationToFeed(queryClient, n)
      if (outcome !== 'duplicate' && !n.isRead) {
        bumpUnreadCount(queryClient)
      }

      if (prefs[n.type] === false) return
      if (isInQuietHours(prefs)) return

      routerRef.current?.route(n)
    },
    [prefs, queryClient],
  )

  useSseStream({
    url: '/api/v1/notifications/stream',
    onMessage: handleMessage,
    enabled: isAuthenticated,
    reconnectDelays: [3000, 10000, 30000],
    initialDelayMs: 2000,
  })

  return <>{children}</>
};
