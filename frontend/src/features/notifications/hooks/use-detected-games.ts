import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useToast } from '@ui/molecules/toast'
import { getDesktopAPI } from '@/lib/desktop/api'
import { localGameKeys } from '@/features/launcher/data/game-queries'
import type { NotificationEvent } from '../types'
import { appendNotificationToFeed, bumpUnreadCount } from '../utils'

export const useDetectedGames = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api) return

    const unsubDetected = api.onNewGamesDetected?.(({ games }) => {
      if (!games || games.length === 0) return

      const count = games.length
      const title = count === 1 ? 'New game detected' : 'New games detected'
      const description =
        count === 1
          ? `${games[0].title} was detected and added to your library.`
          : `${count} new games were detected and added to your library.`

      toast({
        title,
        description,
        variant: 'default',
      })

      for (const game of games) {
        const notif: NotificationEvent = {
          id: `game-detected-${game.id}-${Date.now()}`,
          type: 'system',
          title,
          body: description,
          metadata: { gameId: game.id, path: game.installDir || game.exePath },
          isRead: false,
          createdAt: new Date().toISOString(),
        }
        const outcome = appendNotificationToFeed(queryClient, notif)
        if (outcome !== 'duplicate') {
          bumpUnreadCount(queryClient)
        }
      }

      queryClient.invalidateQueries({ queryKey: localGameKeys.all })
    })

    const unsubNavigate = api.onNotificationNavigate?.((payload) => {
      if (payload.type === 'game_detected') {
        const gameId = payload.metadata?.gameId as string | undefined
        if (gameId) {
          const navPromise = navigate({ to: '/launcher/$gameId', params: { gameId } })
          if (navPromise && typeof (navPromise as any).catch === 'function') {
            ;(navPromise as any).catch(() => {
              void navigate({ to: '/launcher' })
            })
          }
        } else {
          void navigate({ to: '/launcher' })
        }
      }
    })

    return () => {
      unsubDetected?.()
      unsubNavigate?.()
    }
  }, [toast, queryClient, navigate])
}
