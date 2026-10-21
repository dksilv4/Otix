import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { findMediaPreview, type MediaPreviewData } from '../utils/preview'

export const useMediaPreview = (mediaType: string, mediaId: string): MediaPreviewData | null => {
  const queryClient = useQueryClient()

  return useMemo(() => {
    return findMediaPreview(queryClient, mediaType, mediaId)
  }, [queryClient, mediaType, mediaId])
}
