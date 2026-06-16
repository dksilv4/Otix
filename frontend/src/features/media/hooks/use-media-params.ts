import { useParams } from '@tanstack/react-router'

export function useMediaParams() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  return {
    mediaType: (params.mediaType || 'movie') as 'movie' | 'show' | 'game' | 'music',
    mediaId: params.mediaId || '',
  }
}
