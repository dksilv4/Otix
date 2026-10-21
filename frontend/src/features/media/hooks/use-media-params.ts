import { useRouter } from '@tanstack/react-router'

export function useMediaParams() {
  const router = useRouter({ warn: false })
  const matches = router?.state?.matches
  const lastMatch = matches && matches.length > 0 ? matches[matches.length - 1] : undefined
  const params = (lastMatch?.params || {}) as { mediaType?: string; mediaId?: string }

  return {
    mediaType: (params.mediaType || 'movie') as 'movie' | 'show' | 'game' | 'music',
    mediaId: params.mediaId || '',
  }
}
