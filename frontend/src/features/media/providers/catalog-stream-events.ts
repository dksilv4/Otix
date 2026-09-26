import type { QueryClient } from '@tanstack/react-query'
import type { SseEvent } from '@/lib/api/sse-client'
import { mediaKeys } from '@media/queries/media-keys'
import { libraryKeys } from '@library/library-keys'
import { gameKeys } from '@/features/launcher/data/queries'
import { discoverKeys } from '@discover/queries/discover-keys'

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
