import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useSseStream } from '@/lib/hooks/use-sse-stream'
import type { SseEvent } from '@/lib/api/sse-client'

import { applyCatalogStreamEvent } from './catalog-stream-events'

const SSE_RECONNECT_DELAYS = [3000, 10000, 30000]

interface CatalogStreamProviderProps {
  children: React.ReactNode
}

export const CatalogStreamProvider = ({ children }: CatalogStreamProviderProps) => {
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
    reconnectDelays: SSE_RECONNECT_DELAYS,
    initialDelayMs: 2000,
  })

  return <>{children}</>
};
