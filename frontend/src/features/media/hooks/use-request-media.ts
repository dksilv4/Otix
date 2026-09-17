import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import {
  arrKeys,
  useAddServerRadarrMovie,
  useAddServerSonarrSeries,
  useCancelServerRadarrQueueItem,
  useCancelServerSonarrQueueItem,
  useServerRadarrConfig,
  useServerRadarrQueue,
  useServerSonarrConfig,
  useServerSonarrQueue,
} from '@/features/downloads/use-server-arr'
import { readyArrInstances } from '@/features/downloads/arr-instances'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import { mediaQueries } from '@media'
import { useMediaParams } from './use-media-params'
import type { RequestInstance, RequestWidget } from '../components/organisms/plugin-detail-actions'
import {
  arrRequestErrorMessage,
  fileFromRadarrLookup,
  fileFromSonarrLookup,
  instanceLabel,
  isArrMediaType,
  lookupTmdbTerm,
  makeServerArrInstanceId,
  matchArrQueueItem,
  matchLookupByTmdb,
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

export interface RequestMediaState {
  hidden: boolean
  loading: boolean
  mediaType: 'movie' | 'show'
  mediaTitle: string
  requestLabel: string
  instances: RequestInstance[]
  widgets: RequestWidget[]
  hasLibraryStatus: boolean
  requesting: string | null
  queueItem: ServerArrQueueItem | null
  queuePercent: number
  activeServerName: string
  handleRequest: (instanceId?: string) => Promise<void>
  handleCancelQueue: () => void
}

async function lookupOnInstance(
  serverId: number,
  kind: 'radarr' | 'sonarr',
  term: string,
  instanceId: string,
) {
  const path =
    kind === 'radarr'
      ? `/library/servers/${serverId}/radarr/lookup`
      : `/library/servers/${serverId}/sonarr/lookup`
  const { data } = await apiClient.get<unknown[]>(path, {
    params: { term, instance_id: instanceId },
  })
  return data || []
}

export function useRequestMedia(): RequestMediaState {
  const { mediaType: rawType, mediaId } = useMediaParams()
  const enabled = isArrMediaType(rawType)
  const mediaType: 'movie' | 'show' = rawType === 'show' ? 'show' : 'movie'
  const { data: detail } = useQuery({
    ...mediaQueries.detail(rawType, mediaId),
    enabled: enabled && Boolean(mediaId),
  })
  const tmdbId = detail?.tmdbId || ''
  const mediaTitle = detail?.title || ''
  const year = yearFromReleaseDate(detail?.releaseDate)

  const { data: servers = [] } = useGameServers()
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

  const statusQuery = useQuery({
    queryKey: requestMediaKeys.status(serverId, mediaType, String(tmdbId)),
    queryFn: async () => {
      if (!serverId || !tmdbId) return [] as RequestInstance[]
      const term = lookupTmdbTerm(tmdbId)
      return Promise.all(
        instances.map(async (instance) => {
          const id = makeServerArrInstanceId(serverId, instance.id)
          const name = instanceLabel(activeServer?.name || 'Server', instance.name, isMovie ? 'Radarr' : 'Sonarr')
          try {
            const results = await lookupOnInstance(serverId, kind, term, instance.id)
            const match = matchLookupByTmdb(results, tmdbId)
            const status = isMovie ? radarrStatusFromLookup(match) : sonarrStatusFromLookup(match)
            const file = isMovie ? fileFromRadarrLookup(match) : fileFromSonarrLookup(match)
            return toRequestInstance(id, name, status, file)
          } catch {
            return toRequestInstance(id, name, 'error')
          }
        }),
      )
    },
    enabled: hasArr && Boolean(tmdbId),
    staleTime: 15_000,
  })

  const requestable = statusQuery.data || []
  const isRequested = requestable.some((item) => item.status === 'requested')
  const radarrQueue = useServerRadarrQueue(isMovie ? serverId : undefined, 1, 50, isRequested ? 4000 : 15_000)
  const sonarrQueue = useServerSonarrQueue(isShow ? serverId : undefined, 1, 50, isRequested ? 4000 : 15_000)
  const queueRecords = (isMovie ? radarrQueue.data?.records : sonarrQueue.data?.records) || []
  const queueItem = matchArrQueueItem(queueRecords, { tmdbId, title: mediaTitle })

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

  const handleRequest = async (instanceId?: string) => {
    if (!serverId || !tmdbId) return
    const target =
      requestable.find((item) => item.id === instanceId) ||
      requestable.find((item) => item.status === 'not_exists' || item.status === 'error') ||
      requestable[0]
    if (!target) return
    const parsed = parseServerArrInstanceId(target.id)
    setRequesting(target.id)
    try {
      if (isMovie) {
        await addMovie.mutateAsync({
          title: mediaTitle || String(tmdbId),
          tmdb_id: Number(tmdbId),
          year,
          monitored: true,
          search_for_movie: true,
          instance_id: parsed.arrInstanceId,
        })
      } else {
        await addSeries.mutateAsync({
          title: mediaTitle || undefined,
          tmdb_id: Number(tmdbId),
          year,
          monitored: true,
          search_for_missing_episodes: true,
          instance_id: parsed.arrInstanceId,
        })
      }
      await queryClient.invalidateQueries({ queryKey: requestMediaKeys.status(serverId, mediaType, String(tmdbId)) })
      await queryClient.invalidateQueries({ queryKey: isMovie ? arrKeys.radarr.queue(serverId) : arrKeys.sonarr.queue(serverId) })
    } catch (err) {
      throw new Error(arrRequestErrorMessage(err, `Failed to request ${isMovie ? 'movie' : 'show'}`))
    } finally {
      setRequesting(null)
    }
  }

  const handleCancelQueue = () => {
    if (!queueItem) return
    if (isMovie) cancelRadarr.mutate({ queueId: queueItem.id })
    else cancelSonarr.mutate({ queueId: queueItem.id })
  }

  return {
    hidden: !enabled || !serverId || (!configLoading && instances.length === 0),
    loading: Boolean(configLoading || (hasArr && statusQuery.isLoading)),
    mediaType,
    mediaTitle,
    requestLabel: isMovie ? 'Request Movie' : 'Request Show',
    instances: requestable,
    widgets,
    hasLibraryStatus: requestable.some(
      (item) => item.status === 'requested' || item.status === 'downloaded' || item.status === 'error',
    ),
    requesting,
    queueItem,
    queuePercent: queueProgress(queueItem),
    activeServerName: activeServer?.name || 'Server',
    handleRequest,
    handleCancelQueue,
  }
}
