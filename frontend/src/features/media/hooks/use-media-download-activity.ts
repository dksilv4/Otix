import { useMemo, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import {
  useServerSonarrQueue,
  useServerRadarrQueue,
  useCancelServerSonarrQueueItem,
  useCancelServerRadarrQueueItem,
  arrKeys,
} from '@/features/downloads/use-server-arr'
import { useServerUsenetQueue } from '@/features/downloads/use-node-usenet'
import { useDownloads } from '@/features/downloads/use-downloads'
import { useOptionalAuth } from '@/lib/providers/auth'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import { resolveEpisodeMetadata } from '@/features/downloads/utils/episode-download'
import { showToast } from '@ui/molecules/toast'
import { mediaQueries } from '../queries/media-queries'
import { mediaActivityKeys } from './use-media-activity'
import {
  isMatchingArrRecord,
  resolveItemSpeed,
  aggregateQueueProgress,
  isArrQueueItemComplete,
  type MatchMediaOptions,
} from '../utils/media-download'

export interface EpisodeDownloadActivity {
  queueId: number | string
  percentage: number
  timeleft: string | null
  speed: string | null
  status: string
  quality: string | null
  resolution: string | null
  sizeBytes: number
  sizeLeftBytes: number
  downloadedBytes: number
  releaseTitle: string
  seasonNumber: number
  episodeNumber: number
  cancel: () => Promise<void>
  isCancelling: boolean
}

export interface MediaDownloadActivityState {
  isDownloading: boolean
  isCompleted: boolean
  overallProgress: number
  speed: string | null
  eta: string | null
  activeCount: number
  primaryQueueItem: ServerArrQueueItem | null
  episodeDownloads: EpisodeDownloadActivity[]
  getEpisodeDownload: (seasonNumber: number, episodeNumber: number) => EpisodeDownloadActivity | null
  cancelQueueItem: (queueId: number | string) => Promise<void>
  isCancelling: boolean
}

export const useMediaDownloadActivity = (
  mediaType?: string,
  mediaId?: string | number | null,
  options?: MatchMediaOptions,
): MediaDownloadActivityState => {
  const auth = useOptionalAuth()
  const isShow = mediaType === 'show'
  const isMovie = mediaType === 'movie'
  const isGame = mediaType === 'game'

  // Server resolution
  const { data: serverData } = useGameServers()
  const gameServers = Array.isArray(serverData)
    ? serverData
    : (serverData as any)?.servers || []

  const activeServer = useMemo(
    () =>
      gameServers.find((s: any) => typeof s.id === 'number' && s.id > 0 && s.isActive) ??
      gameServers.find((s: any) => typeof s.id === 'number' && s.id > 0),
    [gameServers],
  )
  const activeServerId = activeServer?.id

  // Live queues with 3s polling
  const sonarrQueue = useServerSonarrQueue(isShow ? activeServerId : undefined, 1, 100, 3000)
  const radarrQueue = useServerRadarrQueue(isMovie ? activeServerId : undefined, 1, 50, 3000)
  const usenetQueue = useServerUsenetQueue(activeServerId, 3000)
  const { downloads, cancelDownload: cancelLocalDownload } = useDownloads(auth?.user?.id)

  const cancelSonarr = useCancelServerSonarrQueueItem(activeServerId)
  const cancelRadarr = useCancelServerRadarrQueueItem(activeServerId)

  const usenetItems = usenetQueue.data?.items ?? []
  const usenetSpeed = usenetQueue.data?.speed ?? null

  const matchOpts: MatchMediaOptions = useMemo(
    () => ({
      mediaId,
      tmdbId: options?.tmdbId,
      tvdbId: options?.tvdbId,
      title: options?.title,
    }),
    [mediaId, options?.tmdbId, options?.tvdbId, options?.title],
  )

  // Filter matched Arr queue items
  const matchedRecords = useMemo(() => {
    if (isShow) {
      const records = sonarrQueue.data?.records ?? []
      return records.filter((rec) => isMatchingArrRecord(rec, matchOpts))
    }
    if (isMovie) {
      const records = radarrQueue.data?.records ?? []
      return records.filter((rec) => isMatchingArrRecord(rec, matchOpts))
    }
    return []
  }, [isShow, isMovie, sonarrQueue.data?.records, radarrQueue.data?.records, matchOpts])

  // Map episode downloads for shows
  const { episodeDownloads, episodeMap } = useMemo(() => {
    if (!isShow || matchedRecords.length === 0) {
      return { episodeDownloads: [], episodeMap: new Map<string, EpisodeDownloadActivity>() }
    }

    const map = new Map<string, EpisodeDownloadActivity>()
    const list: EpisodeDownloadActivity[] = []

    for (const rec of matchedRecords) {
      const meta = resolveEpisodeMetadata(rec)
      if (meta.seasonNumber == null || meta.episodeNumber == null) continue

      const speed = resolveItemSpeed(rec, usenetItems, usenetSpeed)
      const key = `${meta.seasonNumber}:${meta.episodeNumber}`

      const epActivity: EpisodeDownloadActivity = {
        queueId: rec.id,
        percentage: meta.percentage,
        timeleft: meta.timeleft,
        speed,
        status: meta.status || 'Downloading',
        quality: meta.quality,
        resolution: meta.resolution,
        sizeBytes: meta.sizeBytes,
        sizeLeftBytes: meta.sizeLeftBytes,
        downloadedBytes: meta.downloadedBytes,
        releaseTitle: rec.title || meta.releaseTitle,
        seasonNumber: meta.seasonNumber,
        episodeNumber: meta.episodeNumber,
        cancel: async () => {
          await cancelSonarr.mutateAsync({ queueId: rec.id })
        },
        isCancelling: cancelSonarr.isPending,
      }

      list.push(epActivity)

      // In case of multiple records for the same episode, prefer the one with higher percentage or active status
      const existing = map.get(key)
      if (!existing || existing.percentage < epActivity.percentage) {
        map.set(key, epActivity)
      }
    }

    return { episodeDownloads: list, episodeMap: map }
  }, [isShow, matchedRecords, usenetItems, usenetSpeed, cancelSonarr])

  const getEpisodeDownload = useCallback(
    (seasonNumber: number, episodeNumber: number): EpisodeDownloadActivity | null => {
      return episodeMap.get(`${seasonNumber}:${episodeNumber}`) || null
    },
    [episodeMap],
  )

  // Aggregated progress across all matched records
  const aggregated = useMemo(() => {
    return aggregateQueueProgress(matchedRecords, usenetItems, usenetSpeed)
  }, [matchedRecords, usenetItems, usenetSpeed])

  // Game download fallback
  const gameDownload = useMemo(() => {
    if (!isGame) return null
    const matched = downloads.find((d) => {
      if (mediaId && d.mediaItemId && String(d.mediaItemId) === String(mediaId)) return true
      if (options?.title && d.mediaItemTitle?.toLowerCase().includes(options.title.toLowerCase())) return true
      if (options?.title && d.nzbName?.toLowerCase().includes(options.title.toLowerCase())) return true
      return false
    })
    return matched || null
  }, [isGame, downloads, mediaId, options?.title])

  const gameUsenetItem = useMemo(() => {
    if (!gameDownload?.sabnzbdNzoId) return null
    return usenetItems.find((u) => u.nzo_id === gameDownload.sabnzbdNzoId) || null
  }, [gameDownload, usenetItems])

  const { allComplete, anyDownloading } = useMemo(() => {
    if (isShow || isMovie) {
      if (matchedRecords.length === 0) {
        return { allComplete: false, anyDownloading: false }
      }
      const completed = matchedRecords.filter(isArrQueueItemComplete)
      return {
        allComplete: completed.length === matchedRecords.length,
        anyDownloading: completed.length < matchedRecords.length,
      }
    }
    if (isGame) {
      const isComplete = Boolean(
        gameDownload && (gameDownload.status === 'completed' || (gameDownload.percentage ?? 0) >= 100),
      )
      const isDl = Boolean(
        gameDownload && gameDownload.status === 'downloading' && (gameDownload.percentage ?? 0) < 100,
      )
      return {
        allComplete: isComplete,
        anyDownloading: isDl,
      }
    }
    return { allComplete: false, anyDownloading: false }
  }, [isShow, isMovie, matchedRecords, isGame, gameDownload])

  const isDownloading = anyDownloading
  const isCompleted = allComplete

  // Auto-invalidation and user notification when download finishes without any manual action needed
  const queryClient = useQueryClient()
  const prevDownloadingRef = useRef(false)

  useEffect(() => {
    if (prevDownloadingRef.current && (allComplete || (matchedRecords.length === 0 && !anyDownloading))) {
      void queryClient.invalidateQueries({ queryKey: mediaActivityKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['request-media'] })
      if (mediaType && mediaId) {
        void queryClient.invalidateQueries({ queryKey: mediaQueries.detail(mediaType, String(mediaId)).queryKey })
      }
      if (activeServerId) {
        if (isMovie) void queryClient.invalidateQueries({ queryKey: arrKeys.radarr.queue(activeServerId) })
        if (isShow) void queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.queue(activeServerId) })
      }

      const mediaTitle = options?.title || 'Media'
      showToast({
        title: `Ready to Stream: ${mediaTitle}`,
        description: 'Download complete and available in your library.',
      })
    }
    prevDownloadingRef.current = anyDownloading
  }, [
    allComplete,
    anyDownloading,
    matchedRecords.length,
    queryClient,
    mediaType,
    mediaId,
    activeServerId,
    isMovie,
    isShow,
    options?.title,
  ])

  const overallProgress = useMemo(() => {
    if (isShow || isMovie) {
      return aggregated.overallProgress
    }
    if (isGame && gameDownload) {
      return gameDownload.percentage ?? 0
    }
    return 0
  }, [isShow, isMovie, aggregated.overallProgress, isGame, gameDownload])

  const speed = useMemo(() => {
    if (isShow || isMovie) {
      return aggregated.speed
    }
    if (isGame && gameDownload) {
      return gameUsenetItem?.speed || usenetSpeed || null
    }
    return null
  }, [isShow, isMovie, aggregated.speed, isGame, gameDownload, gameUsenetItem, usenetSpeed])

  const eta = useMemo(() => {
    if (isShow || isMovie) {
      return aggregated.eta
    }
    if (isGame && gameDownload) {
      return (gameUsenetItem as any)?.timeleft || (gameUsenetItem as any)?.time_left || null
    }
    return null
  }, [isShow, isMovie, aggregated.eta, isGame, gameDownload, gameUsenetItem])

  const cancelQueueItem = useCallback(
    async (queueId: number | string) => {
      if (isShow) {
        await cancelSonarr.mutateAsync({ queueId })
      } else if (isMovie) {
        await cancelRadarr.mutateAsync({ queueId })
      } else if (isGame && gameDownload) {
        cancelLocalDownload(gameDownload.id)
      }
    },
    [isShow, isMovie, isGame, cancelSonarr, cancelRadarr, cancelLocalDownload, gameDownload],
  )

  const isCancelling = cancelSonarr.isPending || cancelRadarr.isPending

  return {
    isDownloading,
    isCompleted,
    overallProgress,
    speed,
    eta,
    activeCount: isShow || isMovie ? matchedRecords.length : isGame && gameDownload ? 1 : 0,
    primaryQueueItem: matchedRecords[0] || null,
    episodeDownloads,
    getEpisodeDownload,
    cancelQueueItem,
    isCancelling,
  }
}
