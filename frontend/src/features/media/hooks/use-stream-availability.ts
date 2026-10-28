import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@auth/hooks/use-auth'
import { useLibraryTab, useStreamableMediaIds } from '@/features/library/library-queries'
import { getPluginAPI } from '@/features/plugins/api'
import type { MediaItemSummary } from '@/features/media/queries/media-queries'
import { fetchPlexConnectInfoCached } from '../utils/plex-stream'

const SLOT_LOCATION = 'media/card/badges'

export interface StreamAvailabilityResult {
  isStreamable: boolean
  providerLabel?: string
  tone?: 'primary' | 'amber' | 'emerald' | 'default'
  isLoading: boolean
}

interface UseStreamAvailabilityParams {
  mediaId: string
  tmdbId?: string | number | null
  mediaType: string
}

export const useStreamableCatalog = () => {
  let plexId: string | null | undefined
  try {
    const auth = useAuth()
    plexId = auth?.user?.plexId
  } catch {
    plexId = undefined
  }
  const isPlexConnected = Boolean(plexId)

  // Query connected library items for streamable matching
  const { data, isLoading, isError } = useLibraryTab('plex', { limit: '100' })

  // Query all streamable catalog media IDs from connected Plex library
  const streamableIdsQuery = useStreamableMediaIds({ enabled: isPlexConnected })
  const streamableIdsData = streamableIdsQuery?.data
  const idsLoading = Boolean(streamableIdsQuery?.isLoading)

  const items = useMemo<MediaItemSummary[]>(() => {
    if (!isPlexConnected || !data?.pages) return []
    return (data.pages as Array<{ items?: unknown[] }>).flatMap((page) =>
      Array.isArray(page?.items) ? (page.items as unknown as MediaItemSummary[]) : [],
    )
  }, [isPlexConnected, data])

  const streamableIds = useMemo<Set<string>>(() => {
    const set = new Set<string>()
    if (Array.isArray(streamableIdsData)) {
      for (const id of streamableIdsData) {
        if (id) set.add(String(id))
      }
    }
    for (const item of items) {
      if (item?.id) set.add(String(item.id))
      if (item?.slug) set.add(String(item.slug))
      if (item?.tmdbId) set.add(String(item.tmdbId))
    }
    return set
  }, [streamableIdsData, items])

  return {
    isPlexConnected,
    items,
    streamableIds,
    isLoading: isPlexConnected && (isLoading || idsLoading),
    isError,
  }
}

export const useStreamAvailability = ({
  mediaId,
  tmdbId,
  mediaType,
}: UseStreamAvailabilityParams): StreamAvailabilityResult => {
  const { streamableIds, isPlexConnected, isLoading: catalogLoading } = useStreamableCatalog()
  const [pluginStreamable, setPluginStreamable] = useState<boolean | null>(null)
  const [pluginLabel, setPluginLabel] = useState<string | undefined>(undefined)
  const [pluginLoading, setPluginLoading] = useState(false)
  const [targetedStreamable, setTargetedStreamable] = useState<boolean | null>(null)
  const [targetedLoading, setTargetedLoading] = useState(false)

  // Check desktop plugin slot data
  useEffect(() => {
    if (mediaType === 'game') return
    const api = getPluginAPI()
    if (!api?.getSlotData) return

    let cancelled = false
    setPluginLoading(true)

    api
      .getSlotData(SLOT_LOCATION, {
        mediaId,
        mediaType,
        tmdbId: tmdbId ? String(tmdbId) : null,
      })
      .then((data: unknown) => {
        if (cancelled) return
        let matched = false
        let label = 'Stream'

        for (const entry of (data as Array<{
          pluginId: string
          data?: { widgets?: Array<{ type: string; props?: Record<string, unknown> }> }
        }>) || []) {
          for (const widget of entry.data?.widgets || []) {
            if (widget.type === 'badge' && widget.props?.text) {
              const text = String(widget.props.text)
              if (
                text.toLowerCase().includes('plex') ||
                text.toLowerCase().includes('jellyfin') ||
                text.toLowerCase().includes('stream') ||
                widget.props.tone === 'success'
              ) {
                matched = true
                label = text
                break
              }
            }
          }
          if (matched) break
        }

        setPluginStreamable(matched)
        if (matched) setPluginLabel(label)
      })
      .catch(() => {
        if (!cancelled) setPluginStreamable(false)
      })
      .finally(() => {
        if (!cancelled) setPluginLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mediaId, tmdbId, mediaType])

  // Media is streamable if present in cached streamable set
  const isCatalogMatch = useMemo(() => {
    if (!isPlexConnected || mediaType === 'game') return false
    if (streamableIds.has(String(mediaId))) return true
    if (tmdbId && streamableIds.has(String(tmdbId))) return true
    return false
  }, [isPlexConnected, streamableIds, mediaId, tmdbId, mediaType])

  // Targeted single-item lookup for Plex if not present in initial shelf
  useEffect(() => {
    if (!isPlexConnected || mediaType === 'game' || !mediaId || isCatalogMatch) {
      setTargetedStreamable(null)
      return
    }

    let cancelled = false
    setTargetedLoading(true)

    fetchPlexConnectInfoCached(mediaId, {
      tmdbId: tmdbId ? String(tmdbId) : undefined,
      mediaType,
    })
      .then((info) => {
        if (cancelled) return
        setTargetedStreamable(Boolean(info && (info.ratingKey || info.rating_key)))
      })
      .catch(() => {
        if (!cancelled) setTargetedStreamable(false)
      })
      .finally(() => {
        if (!cancelled) setTargetedLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isPlexConnected, mediaId, tmdbId, mediaType, isCatalogMatch])

  const isStreamable = Boolean(pluginStreamable || isCatalogMatch || targetedStreamable)
  const providerLabel = pluginLabel || ((isCatalogMatch || targetedStreamable) ? 'Plex' : 'Stream')
  const tone = providerLabel.toLowerCase().includes('plex') ? 'amber' : 'primary'

  return {
    isStreamable,
    providerLabel,
    tone,
    isLoading: pluginLoading || (isPlexConnected && (catalogLoading || targetedLoading)),
  }
}
