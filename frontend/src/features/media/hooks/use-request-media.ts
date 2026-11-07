import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useHasSession } from '@/lib/providers/auth'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import {
  arrKeys,
  useAddServerRadarrMovie,
  useAddServerSonarrSeries,
  useCancelServerRadarrQueueItem,
  useCancelServerSonarrQueueItem,
  useServerRadarrConfig,
  useServerRadarrQualityProfiles,
  useServerRadarrQueue,
  useServerSonarrConfig,
  useServerSonarrQualityProfiles,
  useServerSonarrQueue,
} from '@/features/downloads/use-server-arr'
import { readyArrInstances, type ArrServiceInstance } from '@/features/downloads/arr-instances'
import { findBestArrInstance } from '@/features/downloads/utils/arr-routing'
import { mediaActivityKeys, useMediaActivity } from './use-media-activity'
import { showToast } from '@ui/molecules/toast'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import { mediaQueries } from '@media/queries/media-queries'
import { useMediaParams } from './use-media-params'
import { useMediaDownloadActivity } from './use-media-download-activity'
import type { RequestInstance, RequestWidget } from '../components/organisms/plugin-detail-actions'
import {
  arrRequestErrorMessage,
  fileFromRadarrLookup,
  fileFromSonarrLookup,
  instanceLabel,
  isArrMediaType,
  libraryIdFromLookup,
  lookupTmdbTerm,
  makeServerArrInstanceId,
  matchArrQueueItem,
  matchLookupByTmdb,
  matchLookupByTvdbOrTmdb,
  parseServerArrInstanceId,
  queueProgress,
  radarrStatusFromLookup,
  requestWidgetFromInstances,
  sonarrStatusFromLookup,
  toRequestInstance,
  yearFromReleaseDate,
} from './arr-detail-status'

export const requestMediaKeys = {
  all: ['request-media'] as const,
  status: (serverId: number | undefined, mediaType: string, tmdbId: string) =>
    [...requestMediaKeys.all, serverId, mediaType, tmdbId] as const,
}

export interface RequestMediaOptions {
  instanceId?: string
  qualityProfileId?: number
  rootFolderPath?: string
  searchNow?: boolean
  monitored?: boolean
}

export interface RequestMediaState {
  hidden: boolean
  loading: boolean
  mediaType: 'movie' | 'show'
  mediaTitle: string
  mediaYear?: number
  posterUrl?: string | null
  requestLabel: string
  loadingLabel?: string
  disabledReason?: string | null
  instances: RequestInstance[]
  widgets: RequestWidget[]
  hasLibraryStatus: boolean
  requesting: string | null
  queueItem: ServerArrQueueItem | null
  queuePercent: number
  downloadSpeed?: string | null
  downloadEta?: string | null
  activeServerName: string
  serverId?: number
  handleRequest: (opts?: string | RequestMediaOptions) => Promise<void>
  handleCancelQueue: () => void
  refetchStatus?: () => Promise<unknown>
  isCheckingStatus?: boolean
  autoMatchedInstance?: ArrServiceInstance | null
  qualityProfiles?: Array<{ id: number; name: string }>
  isSingleOrAutoRouted?: boolean
  defaultQualityProfileId?: number
  recentlyRequested?: boolean
}

async function lookupOnInstance(
  serverId: number,
  kind: 'radarr' | 'sonarr',
  term: string,
  instanceId: string,
) {
  const path =
    kind === 'radarr'
      ? `/library/nodes/${serverId}/radarr/lookup`
      : `/library/nodes/${serverId}/sonarr/lookup`
  const { data } = await apiClient.get<unknown[]>(path, {
    params: { term, instance_id: instanceId },
  })
  return data || []
}

export function useRequestMedia(): RequestMediaState {
  const { mediaType: rawType, mediaId } = useMediaParams()
  const hasSession = useHasSession()
  const enabled = isArrMediaType(rawType)
  const mediaType: 'movie' | 'show' = rawType === 'show' ? 'show' : 'movie'
  const detailQuery = useQuery({
    ...mediaQueries.detail(rawType, mediaId),
    enabled: enabled && Boolean(mediaId),
  })
  const detail = detailQuery.data
  const detailLoading = detailQuery.isLoading
  const tmdbId =
    detail?.tmdbId ||
    (mediaId && /^tmdb:(?:movie:|show:)?(\d+)$/i.exec(mediaId)?.[1]) ||
    ''
  const tvdbId = detail?.tvdbId || ''
  const mediaTitle = detail?.title || ''
  const year = yearFromReleaseDate(detail?.releaseDate)

  const { data: servers = [] } = useGameServers({ enabled: enabled && hasSession })
  const activeServer = servers.find((server) => server.isActive) || servers[0] || null
  const isMovie = enabled && mediaType === 'movie'
  const isShow = enabled && mediaType === 'show'
  const serverId = enabled ? activeServer?.id : undefined
  const kind = isMovie ? 'radarr' : 'sonarr'

  const radarrConfig = useServerRadarrConfig(isMovie ? serverId : undefined)
  const sonarrConfig = useServerSonarrConfig(isShow ? serverId : undefined)
  const config = isMovie ? radarrConfig.data : sonarrConfig.data
  const configLoading = isMovie ? radarrConfig.isLoading : sonarrConfig.isLoading
  const instances = readyArrInstances(config, isMovie ? 7878 : 8989)
  const hasArr = enabled && Boolean(serverId) && instances.length > 0
  const identifier = String(tmdbId || tvdbId || mediaTitle)
  const [recentlyRequested, setRecentlyRequested] = useState(false)

  const mediaGenres = useMemo(() => {
    if (!detail) return []
    const genres = (detail as any).genres
    if (Array.isArray(genres)) {
      return genres.map((g: any) => (typeof g === 'string' ? g : g?.name || '')).filter(Boolean)
    }
    return []
  }, [detail])

  const autoMatchedInstance = useMemo(() => {
    if (!instances.length) return null
    return findBestArrInstance(instances, {
      title: mediaTitle,
      isAnime: detail?.movie?.isAnime || (detail as any)?.show?.isAnime,
      originalLanguage: detail?.originalLanguage,
      genres: mediaGenres,
    })
  }, [instances, mediaTitle, detail, mediaGenres])

  const targetArrInstId = autoMatchedInstance?.id || instances[0]?.id
  const radarrProfilesQuery = useServerRadarrQualityProfiles(
    isMovie ? serverId : undefined,
    targetArrInstId,
    { enabled: hasArr && isMovie && Boolean(targetArrInstId) },
  )
  const sonarrProfilesQuery = useServerSonarrQualityProfiles(
    isShow ? serverId : undefined,
    targetArrInstId,
    { enabled: hasArr && isShow && Boolean(targetArrInstId) },
  )
  const qualityProfiles = (isMovie ? radarrProfilesQuery?.data : sonarrProfilesQuery?.data) || []
  const defaultQualityProfileId =
    autoMatchedInstance?.quality_profile_id ??
    autoMatchedInstance?.qualityProfileId ??
    config?.quality_profile_id ??
    config?.qualityProfileId ??
    qualityProfiles[0]?.id
  const isSingleOrAutoRouted = instances.length === 1 || Boolean(autoMatchedInstance)

  const nodeActivity = useMediaActivity(
    mediaType,
    tmdbId,
    detail?.id ? String(detail.id) : mediaId,
    tvdbId,
    mediaTitle,
  )

  const statusQuery = useQuery({
    queryKey: requestMediaKeys.status(serverId, mediaType, identifier),
    queryFn: async () => {
      if (!serverId || (!tmdbId && !tvdbId && !mediaTitle)) return [] as RequestInstance[]
      const term = isMovie
        ? (tmdbId ? lookupTmdbTerm(tmdbId) : mediaTitle)
        : (tvdbId ? `tvdb:${tvdbId}` : (mediaTitle || (tmdbId ? lookupTmdbTerm(tmdbId) : '')))
      return Promise.all(
        instances.map(async (instance) => {
          const id = makeServerArrInstanceId(serverId, instance.id)
          const name = instanceLabel(activeServer?.name || 'Server', instance.name, isMovie ? 'Radarr' : 'Sonarr')
          try {
            const results = await lookupOnInstance(serverId, kind, term, instance.id)
            const match = isMovie
              ? (tmdbId ? matchLookupByTmdb(results, tmdbId) : (results[0] as Record<string, unknown> | undefined))
              : (tvdbId || tmdbId ? matchLookupByTvdbOrTmdb(results, tvdbId, tmdbId) : (results[0] as Record<string, unknown> | undefined))
            let status = isMovie ? radarrStatusFromLookup((match as any) ?? null) : sonarrStatusFromLookup((match as any) ?? null)
            let file = isMovie ? fileFromRadarrLookup((match as any) ?? null) : fileFromSonarrLookup((match as any) ?? null)

            if (nodeActivity?.status === 'available') {
              if (status === 'requested' || (match && libraryIdFromLookup(match as any))) {
                status = nodeActivity.isPartial ? 'partially_available' : 'downloaded'
                if (!file || (!file.size && !file.quality)) {
                  file = {
                    name: null,
                    size: nodeActivity.sizeOnDisk ?? null,
                    quality: nodeActivity.episodeCount
                      ? `${nodeActivity.episodeCount}/${nodeActivity.totalEpisodes || nodeActivity.episodeCount} episodes`
                      : 'Available to stream',
                    video: null,
                    audio: null,
                  }
                }
              }
            }

            return toRequestInstance(id, name, status, file)
          } catch {
            return toRequestInstance(id, name, 'error')
          }
        }),
      )
    },
    enabled: hasArr && Boolean(tmdbId || tvdbId || mediaTitle),
    staleTime: 15_000,
  })

  const requestable = statusQuery.data || []
  const isRequested = requestable.some((item) => item.status === 'requested')
  const shouldPollFast = isRequested || recentlyRequested
  const radarrQueue = useServerRadarrQueue(isMovie ? serverId : undefined, 1, 50, shouldPollFast ? 1500 : false)
  const sonarrQueue = useServerSonarrQueue(isShow ? serverId : undefined, 1, 50, shouldPollFast ? 1500 : false)
  const queueRecords = (isMovie ? radarrQueue.data?.records : sonarrQueue.data?.records) || []

  const downloadActivity = useMediaDownloadActivity(mediaType, detail?.id ? String(detail.id) : mediaId, {
    tmdbId,
    tvdbId,
    title: mediaTitle,
  })
  const queueItem = downloadActivity.primaryQueueItem || matchArrQueueItem(queueRecords, { tmdbId, title: mediaTitle })
  const queuePercent = downloadActivity.isDownloading ? downloadActivity.overallProgress : queueProgress(queueItem)

  const addMovie = useAddServerRadarrMovie(serverId)
  const addSeries = useAddServerSonarrSeries(serverId)
  const cancelRadarr = useCancelServerRadarrQueueItem(serverId)
  const cancelSonarr = useCancelServerSonarrQueueItem(serverId)
  const queryClient = useQueryClient()
  const [requesting, setRequesting] = useState<string | null>(null)

  const widgets = useMemo(() => {
    if (requestable.length === 0) return []
    return [
      requestWidgetFromInstances(
        isMovie ? 'server-radarr' : 'server-sonarr',
        isMovie ? 'Radarr' : 'Sonarr',
        mediaType,
        String(tmdbId),
        requestable,
      ),
    ]
  }, [isMovie, mediaType, requestable, tmdbId])

  const handleRequest = async (opts?: string | RequestMediaOptions) => {
    if (!serverId || (!tmdbId && !tvdbId && !mediaTitle)) return
    const options: RequestMediaOptions = typeof opts === 'string' ? { instanceId: opts } : (opts || {})
    const target =
      requestable.find((item) => item.id === options.instanceId) ||
      (autoMatchedInstance ? requestable.find((item) => item.id.endsWith(`:${autoMatchedInstance.id}`)) : null) ||
      requestable.find((item) => item.status === 'not_exists' || item.status === 'error') ||
      requestable[0] ||
      (options.instanceId ? { id: options.instanceId, name: options.instanceId, status: 'not_exists' as const } : null) ||
      (instances[0] ? { id: instances[0].id, name: instances[0].name, status: 'not_exists' as const } : null)
    if (!target) return
    const parsed = parseServerArrInstanceId(target.id)
    setRequesting(target.id)
    try {
      if (isMovie) {
        await addMovie.mutateAsync({
          title: mediaTitle || (tmdbId ? String(tmdbId) : ''),
          tmdb_id: tmdbId ? Number(tmdbId) : undefined,
          year,
          monitored: options.monitored ?? true,
          search_for_movie: options.searchNow ?? true,
          quality_profile_id: options.qualityProfileId,
          root_folder_path: options.rootFolderPath,
          instance_id: parsed.arrInstanceId,
        })
      } else {
        await addSeries.mutateAsync({
          title: mediaTitle || undefined,
          tvdb_id: tvdbId ? Number(tvdbId) : undefined,
          tmdb_id: tmdbId ? Number(tmdbId) : undefined,
          year,
          monitored: options.monitored ?? true,
          search_for_missing_episodes: options.searchNow ?? true,
          quality_profile_id: options.qualityProfileId,
          root_folder_path: options.rootFolderPath,
          instance_id: parsed.arrInstanceId,
        })
      }
      await queryClient.invalidateQueries({ queryKey: requestMediaKeys.status(serverId, mediaType, identifier) })
      await queryClient.invalidateQueries({ queryKey: isMovie ? arrKeys.radarr.queue(serverId) : arrKeys.sonarr.queue(serverId) })
      await queryClient.invalidateQueries({ queryKey: mediaActivityKeys.all })
      setRecentlyRequested(true)
      showToast({
        title: `${isMovie ? 'Movie' : 'Show'} Requested`,
        description: `Sent to ${target.name || (isMovie ? 'Radarr' : 'Sonarr')}. Searching indexers...`,
      })
    } catch (err) {
      throw new Error(arrRequestErrorMessage(err, `Failed to request ${isMovie ? 'movie' : 'show'}`))
    } finally {
      setRequesting(null)
    }
  }

  const handleCancelQueue = () => {
    if (downloadActivity.primaryQueueItem) {
      void downloadActivity.cancelQueueItem(downloadActivity.primaryQueueItem.id)
      return
    }
    if (!queueItem) return
    if (isMovie) cancelRadarr.mutate({ queueId: queueItem.id })
    else cancelSonarr.mutate({ queueId: queueItem.id })
  }

  const serviceName = isMovie ? 'Radarr' : 'Sonarr'
  const loading = Boolean(detailLoading || configLoading || (hasArr && statusQuery.isLoading))
  const loadingLabel = isMovie ? 'Checking Radarr…' : 'Checking Sonarr…'

  const disabledReason = useMemo(() => {
    if (requesting != null) {
      return `Requesting from ${activeServer?.name || 'server'}…`
    }
    if (loading) {
      return `Checking ${serviceName} library status…`
    }
    if (hasArr && instances.length === 0) {
      return `No ${serviceName} instance configured on ${activeServer?.name || 'server'}`
    }
    if (statusQuery.isError) {
      return `Failed to connect to ${serviceName} on ${activeServer?.name || 'server'}`
    }
    if (!tmdbId && !tvdbId && !mediaTitle) {
      return isMovie ? 'Movie TMDb ID is unavailable' : 'Show TVDb/TMDb ID is unavailable'
    }
    if (requestable.length === 0) {
      return `No ${serviceName} instances available`
    }
    const hasTargets = requestable.some((item) => item.status === 'not_exists' || item.status === 'error')
    if (!hasTargets) {
      const allDownloaded = requestable.every((item) => item.status === 'downloaded')
      if (allDownloaded) return `Already available in ${serviceName} library`
      const allRequested = requestable.every((item) => item.status === 'requested')
      if (allRequested) return `Already requested in ${serviceName}`
      return `Already available or requested on all ${serviceName} instances`
    }
    return null
  }, [
    requesting,
    loading,
    serviceName,
    hasArr,
    instances.length,
    activeServer?.name,
    statusQuery.isError,
    tmdbId,
    tvdbId,
    mediaTitle,
    isMovie,
    requestable,
  ])

  return {
    hidden: !enabled || !serverId || (!configLoading && instances.length === 0),
    loading,
    loadingLabel,
    disabledReason,
    mediaType,
    mediaTitle,
    mediaYear: year,
    posterUrl: detail?.posterUrl || null,
    requestLabel: isMovie ? 'Request Movie' : 'Request Show',
    instances: requestable,
    widgets,
    hasLibraryStatus: requestable.some(
      (item) => item.status === 'requested' || item.status === 'downloaded' || item.status === 'error',
    ),
    requesting,
    queueItem,
    queuePercent,
    downloadSpeed: downloadActivity.speed,
    downloadEta: downloadActivity.eta || queueItem?.timeleft,
    activeServerName: activeServer?.name || 'Server',
    serverId,
    handleRequest,
    handleCancelQueue,
    refetchStatus: statusQuery.refetch,
    isCheckingStatus: statusQuery.isFetching,
    autoMatchedInstance,
    qualityProfiles,
    isSingleOrAutoRouted,
    defaultQualityProfileId,
    recentlyRequested,
  }
}
