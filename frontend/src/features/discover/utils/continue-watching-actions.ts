import { apiClient } from '@/lib/api/client'
import { queryClient } from '@/lib/query/client'
import { discoverKeys } from '../queries/discover-keys'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import type { DiscoverContinueWatchingItem } from '../types'

export interface ContinueWatchingPlexActionParams {
  ratingKey: string
  serverId?: string
  mediaItemId?: number | string | null
  mediaType?: 'movie' | 'show'
  title?: string
}

export const markContinueWatchingWatched = async ({
  ratingKey,
  serverId,
  mediaItemId,
  mediaType,
  title,
}: ContinueWatchingPlexActionParams): Promise<boolean> => {
  try {
    await apiClient.post('/integrations/plex/scrobble', {
      ratingKey,
      watched: true,
      serverId,
    })

    void queryClient.invalidateQueries({ queryKey: discoverKeys.continueWatching() })
    void queryClient.invalidateQueries({ queryKey: ['user', 'me', 'continue'] })
    if (mediaItemId && mediaType) {
      void queryClient.invalidateQueries({ queryKey: ['interaction', mediaType, String(mediaItemId)] })
      void queryClient.invalidateQueries({ queryKey: ['media', 'detail', mediaType, String(mediaItemId)] })
      void queryClient.invalidateQueries({ queryKey: ['episode-interactions', 'show', String(mediaItemId)] })
    }

    showToast({
      title: 'Marked as watched on Plex',
      description: title ? `"${title}" was marked as watched.` : undefined,
      variant: 'success',
    })
    return true
  } catch (err) {
    showErrorToast(err, 'Failed to mark as watched on Plex')
    return false
  }
}

export const markContinueWatchingUnwatched = async ({
  ratingKey,
  serverId,
  mediaItemId,
  mediaType,
  title,
}: ContinueWatchingPlexActionParams): Promise<boolean> => {
  try {
    await apiClient.post('/integrations/plex/scrobble', {
      ratingKey,
      watched: false,
      serverId,
    })

    void queryClient.invalidateQueries({ queryKey: discoverKeys.continueWatching() })
    void queryClient.invalidateQueries({ queryKey: ['user', 'me', 'continue'] })
    if (mediaItemId && mediaType) {
      void queryClient.invalidateQueries({ queryKey: ['interaction', mediaType, String(mediaItemId)] })
      void queryClient.invalidateQueries({ queryKey: ['media', 'detail', mediaType, String(mediaItemId)] })
      void queryClient.invalidateQueries({ queryKey: ['episode-interactions', 'show', String(mediaItemId)] })
    }

    showToast({
      title: 'Marked as unwatched on Plex',
      description: title ? `"${title}" was marked as unwatched.` : undefined,
      variant: 'success',
    })
    return true
  } catch (err) {
    showErrorToast(err, 'Failed to mark as unwatched on Plex')
    return false
  }
}

export const removeContinueWatchingItem = async ({
  ratingKey,
  serverId,
  title,
}: {
  ratingKey: string
  serverId?: string
  title?: string
}): Promise<boolean> => {
  try {
    // Optimistically update continue watching list
    queryClient.setQueryData<DiscoverContinueWatchingItem[]>(
      discoverKeys.continueWatching(),
      (old) => (Array.isArray(old) ? old.filter((item) => String(item.ratingKey) !== String(ratingKey)) : []),
    )

    await apiClient.delete('/integrations/plex/continue-watching', {
      data: {
        ratingKey,
        serverId,
      },
    })

    void queryClient.invalidateQueries({ queryKey: discoverKeys.continueWatching() })
    void queryClient.invalidateQueries({ queryKey: ['user', 'me', 'continue'] })

    showToast({
      title: 'Removed from Continue Watching',
      description: title ? `"${title}" was removed.` : undefined,
      variant: 'success',
    })
    return true
  } catch (err) {
    void queryClient.invalidateQueries({ queryKey: discoverKeys.continueWatching() })
    showErrorToast(err, 'Failed to remove from Continue Watching')
    return false
  }
}
