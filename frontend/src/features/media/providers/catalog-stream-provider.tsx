import { useCallback } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useSseStream } from '@/lib/hooks/use-sse-stream'
import type { SseEvent } from '@/lib/api/sse-client'
import { mediaKeys } from '@media/queries/media-keys'
import { libraryKeys } from '@library/library-keys'
import { gameKeys } from '@/features/launcher/data/queries'
import { discoverKeys } from '@discover/queries/discover-keys'

interface CatalogStreamProviderProps {
  children: React.ReactNode
}

function invalidateMergedLists(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
  queryClient.invalidateQueries({ queryKey: discoverKeys.all() })
}

export function applyCatalogStreamEvent(queryClient: QueryClient, event: SseEvent) {
  if (event.type === 'media.updated') {
    const id = String(event.id ?? '')
    const mediaType = String(event.mediaType ?? '')
    if (!id) return
    queryClient.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, id) })
    queryClient.invalidateQueries({ queryKey: gameKeys.detail(id) })
    return
  }
  if (event.type === 'media.merged') {
    const fromId = String(event.fromId ?? '')
    const toId = String(event.toId ?? '')
    const mediaType = String(event.mediaType ?? '')
    if (fromId) {
      queryClient.removeQueries({ queryKey: mediaKeys.detail(mediaType, fromId) })
      queryClient.removeQueries({ queryKey: gameKeys.detail(fromId) })
    }
    if (toId) {
      queryClient.invalidateQueries({ queryKey: mediaKeys.detail(mediaType, toId) })
      queryClient.invalidateQueries({ queryKey: gameKeys.detail(toId) })
    }
    invalidateMergedLists(queryClient)
  }
}

export function CatalogStreamProvider({ children }: CatalogStreamProviderProps) {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const handleMessage = useCallback(
    (event: SseEvent) => {
      applyCatalogStreamEvent(queryClient, event)
    },
    [queryClient],
  )

  useSseStream({
    url: '/api/v1/media/stream',
    onMessage: handleMessage,
    enabled: isAuthenticated,
    reconnectDelays: [3000, 10000, 30000],
    initialDelayMs: 2000,
  })

  return <>{children}</>
}
