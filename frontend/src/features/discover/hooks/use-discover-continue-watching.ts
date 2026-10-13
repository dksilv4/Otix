import { useRef } from 'react'
import { useInView } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useFeature } from '@/features/_config'
import { discoverQueries } from '../queries/discover-queries'
import type { DiscoverContinueWatchingItem } from '../types'

const PREFETCH_MARGIN = '0px 0px 200px 0px'

export const useDiscoverContinueWatching = (eager = false) => {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: PREFETCH_MARGIN })
  const { user } = useAuth()
  const plexEnabled = useFeature('integration:plex')
  const isPlexConnected = Boolean(user?.plexId && plexEnabled)

  const enabled = isPlexConnected && (eager || isInView)

  const query = useQuery({
    ...discoverQueries.continueWatching(),
    enabled,
    refetchIntervalInBackground: false,
    retry: 1,
    meta: { suppressToast: true },
  })

  const items = (query.data as DiscoverContinueWatchingItem[] | undefined) ?? []
  const showSkeleton = isPlexConnected && (!enabled || query.isLoading)
  const isEmpty = isPlexConnected && enabled && query.isSuccess && items.length === 0

  return {
    ref,
    items,
    showSkeleton,
    isEmpty,
    isInView,
    isPlexConnected,
    ...query,
  }
}
