import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '@/lib/api/client'
import { queryClient } from '@/lib/query/client'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import {
  markContinueWatchingWatched,
  markContinueWatchingUnwatched,
  removeContinueWatchingItem,
} from '../continue-watching-actions'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/query/client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
}))

vi.mock('@ui/molecules/toast', () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
}))

describe('continue-watching-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('markContinueWatchingWatched', () => {
    it('calls plex scrobble endpoint with watched=true and invalidates queries', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { success: true } })

      const success = await markContinueWatchingWatched({
        ratingKey: '101',
        serverId: 'srv-1',
        mediaItemId: 42,
        mediaType: 'show',
        title: 'Severance',
      })

      expect(success).toBe(true)
      expect(apiClient.post).toHaveBeenCalledWith('/integrations/plex/scrobble', {
        ratingKey: '101',
        watched: true,
        serverId: 'srv-1',
      })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['discover', 'continue-watching'],
      })
      expect(showToast).toHaveBeenCalledWith({
        title: 'Marked as watched on Plex',
        description: '"Severance" was marked as watched.',
        variant: 'success',
      })
    })

    it('handles api error gracefully and shows error toast', async () => {
      const error = new Error('Network error')
      vi.mocked(apiClient.post).mockRejectedValueOnce(error)

      const success = await markContinueWatchingWatched({
        ratingKey: '101',
      })

      expect(success).toBe(false)
      expect(showErrorToast).toHaveBeenCalledWith(error, 'Failed to mark as watched on Plex')
    })
  })

  describe('markContinueWatchingUnwatched', () => {
    it('calls plex scrobble endpoint with watched=false and invalidates queries', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { success: true } })

      const success = await markContinueWatchingUnwatched({
        ratingKey: '202',
        serverId: 'srv-2',
        mediaItemId: 99,
        mediaType: 'movie',
        title: 'Interstellar',
      })

      expect(success).toBe(true)
      expect(apiClient.post).toHaveBeenCalledWith('/integrations/plex/scrobble', {
        ratingKey: '202',
        watched: false,
        serverId: 'srv-2',
      })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['discover', 'continue-watching'],
      })
      expect(showToast).toHaveBeenCalledWith({
        title: 'Marked as unwatched on Plex',
        description: '"Interstellar" was marked as unwatched.',
        variant: 'success',
      })
    })

    it('handles api error gracefully and shows error toast', async () => {
      const error = new Error('Server error')
      vi.mocked(apiClient.post).mockRejectedValueOnce(error)

      const success = await markContinueWatchingUnwatched({
        ratingKey: '202',
      })

      expect(success).toBe(false)
      expect(showErrorToast).toHaveBeenCalledWith(error, 'Failed to mark as unwatched on Plex')
    })
  })

  describe('removeContinueWatchingItem', () => {
    it('optimistically removes item and calls delete continue-watching endpoint', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { success: true } })

      const success = await removeContinueWatchingItem({
        ratingKey: '303',
        serverId: 'srv-3',
        title: 'Dune',
      })

      expect(success).toBe(true)
      expect(queryClient.setQueryData).toHaveBeenCalled()
      expect(apiClient.delete).toHaveBeenCalledWith('/integrations/plex/continue-watching', {
        data: {
          ratingKey: '303',
          serverId: 'srv-3',
        },
      })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['discover', 'continue-watching'],
      })
      expect(showToast).toHaveBeenCalledWith({
        title: 'Removed from Continue Watching',
        description: '"Dune" was removed.',
        variant: 'success',
      })
    })

    it('invalidates queries and displays error toast on failure', async () => {
      const error = new Error('Unauthorized')
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error)

      const success = await removeContinueWatchingItem({
        ratingKey: '303',
      })

      expect(success).toBe(false)
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['discover', 'continue-watching'],
      })
      expect(showErrorToast).toHaveBeenCalledWith(error, 'Failed to remove from Continue Watching')
    })
  })
})
