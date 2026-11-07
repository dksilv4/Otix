import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { usePlayer } from '@/lib/player/use-player'
import type { PlexTrackInfo } from '@/lib/player/types'

export interface PlexMusicSection {
  id: number
  serverId: number | null
  serverName: string
  sectionKey: string
  title: string
  libraryType: string
}

export interface PlexBrowseItem {
  ratingKey: string
  title: string
  artist: string
  thumbUrl: string | null
  year: number | null
  trackCount: number | null
  durationMs: number | null
  type: string
  partKey?: string | null
}

export interface PlexBrowseResult {
  items: PlexBrowseItem[]
  totalCount?: number
  offset?: number
  limit?: number
  baseUrl: string | null
  token: string | null
  serverId: number
  libraryId: number
}

export interface PlexAlbumTracksResponse {
  tracks: Array<{
    ratingKey: string
    title: string
    artist: string
    trackNumber: number
    discNumber: number
    durationMs: number | null
    partKey?: string | null
  }>
  baseUrl: string | null
  token: string | null
  ratingKey: string
  albumThumbUrl: string | null
}

export interface PlexArtistDetails {
  artist: {
    ratingKey: string
    name: string
    summary: string
    thumbUrl: string | null
    artUrl: string | null
  }
  albums: Array<{
    ratingKey: string
    title: string
    artist: string
    year: number | null
    trackCount: number | null
    thumbUrl: string | null
    type: string
  }>
  tracks: Array<{
    ratingKey: string
    title: string
    artist: string
    albumName: string
    trackNumber: number
    discNumber: number
    durationMs: number | null
    partKey?: string | null
  }>
  baseUrl: string | null
  token: string | null
  serverId: number
}

export type PlexBrowseType = 'albums' | 'artists' | 'tracks' | 'playlists'

export const usePlexMusic = () => {
  const queryClient = useQueryClient()
  const { playPlexAlbum } = usePlayer()
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [browseType, setBrowseType] = useState<PlexBrowseType>('albums')
  const [searchQuery, setSearchQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const [offset, setOffset] = useState(0)
  const [isDiscovering, setIsDiscovering] = useState(false)

  const { data: sectionsData, isLoading: isLoadingSections } = useQuery({
    queryKey: ['plex-music-sections'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ sections: PlexMusicSection[] }>(
        '/integrations/plex/music/sections',
      )
      return data?.sections ?? []
    },
    staleTime: 1000 * 60 * 5,
  })

  const sections = useMemo(() => sectionsData || [], [sectionsData])

  const activeSectionId = selectedSectionId ?? (sections.length > 0 ? sections[0].id : null)

  const activeServerId = useMemo(() => {
    const sec = sections.find((s) => s.id === activeSectionId)
    return sec?.serverId ?? null
  }, [sections, activeSectionId])

  const discoverSections = useCallback(async () => {
    setIsDiscovering(true)
    try {
      const { data } = await apiClient.post<{ sections: PlexMusicSection[] }>(
        '/integrations/plex/music/sections',
      )
      if (data?.sections) {
        queryClient.setQueryData(['plex-music-sections'], data.sections)
        if (data.sections.length > 0 && !selectedSectionId) {
          setSelectedSectionId(data.sections[0].id)
        }
      }
    } catch (err) {
      console.error('[usePlexMusic] Failed to discover Plex music sections:', err)
    } finally {
      setIsDiscovering(false)
    }
  }, [queryClient, selectedSectionId])

  const {
    data: browseData,
    isLoading: isLoadingBrowse,
    isFetching: isFetchingBrowse,
    refetch: refetchBrowse,
  } = useQuery({
    queryKey: ['plex-music-browse', activeSectionId, browseType, searchQuery, limit, offset],
    queryFn: async () => {
      if (!activeSectionId) return null
      const { data } = await apiClient.get<PlexBrowseResult>(
        '/integrations/plex/music/browse',
        {
          params: {
            libraryId: activeSectionId,
            browseType,
            query: searchQuery.trim(),
            limit,
            offset,
          },
        },
      )
      return data
    },
    enabled: !!activeSectionId,
    staleTime: 1000 * 60 * 2,
  })

  const playPlexItems = useCallback(
    async (itemList: PlexBrowseItem[], startIndex = 0) => {
      if (!browseData?.baseUrl || !browseData?.token || itemList.length === 0) return
      const tracks: PlexTrackInfo[] = itemList.map((item) => ({
        id: item.ratingKey,
        ratingKey: item.ratingKey,
        title: item.title,
        artist: item.artist,
        albumName: item.title,
        albumArt: item.thumbUrl,
        durationMs: item.durationMs || 0,
        plexBaseUrl: browseData.baseUrl as string,
        plexToken: browseData.token as string,
        partKey: item.partKey,
      }))
      await playPlexAlbum(tracks, startIndex)
    },
    [browseData, playPlexAlbum],
  )

  const playPlexItem = useCallback(
    async (item: PlexBrowseItem) => {
      await playPlexItems([item], 0)
    },
    [playPlexItems],
  )

  const playPlexAlbumByRatingKey = useCallback(
    async (
      ratingKey: string,
      albumTitle?: string,
      albumArtist?: string,
      albumThumb?: string | null,
    ) => {
      const srvId = activeServerId ?? browseData?.serverId
      if (!srvId) return
      try {
        const { data } = await apiClient.get<PlexAlbumTracksResponse>(
          `/integrations/plex/music/album/${ratingKey}`,
          {
            params: { serverId: srvId },
          },
        )
        if (!data || !data.baseUrl || !data.token) return

        const tracks: PlexTrackInfo[] = (data.tracks || []).map((t) => ({
          id: t.ratingKey,
          ratingKey: t.ratingKey,
          title: t.title,
          artist: t.artist || albumArtist || '',
          albumName: albumTitle || '',
          albumArt: albumThumb || data.albumThumbUrl,
          durationMs: t.durationMs || 0,
          plexBaseUrl: data.baseUrl,
          plexToken: data.token,
          partKey: t.partKey,
        }))

        if (tracks.length > 0) {
          await playPlexAlbum(tracks)
        }
      } catch (err) {
        console.error('[usePlexMusic] Failed to play album:', err)
      }
    },
    [activeServerId, browseData?.serverId, playPlexAlbum],
  )

  const playPlexArtistByRatingKey = useCallback(
    async (ratingKey: string, artistName?: string, artistThumb?: string | null) => {
      const srvId = activeServerId ?? browseData?.serverId
      if (!srvId) return
      try {
        const { data } = await apiClient.get<PlexArtistDetails>(
          `/integrations/plex/music/artist/${ratingKey}`,
          {
            params: { serverId: srvId },
          },
        )
        if (!data || !data.baseUrl || !data.token) return

        const tracks: PlexTrackInfo[] = (data.tracks || []).map((t) => ({
          id: t.ratingKey,
          ratingKey: t.ratingKey,
          title: t.title,
          artist: t.artist || artistName || data.artist?.name || '',
          albumName: t.albumName || '',
          albumArt: artistThumb || data.artist?.thumbUrl,
          durationMs: t.durationMs || 0,
          plexBaseUrl: data.baseUrl,
          plexToken: data.token,
          partKey: t.partKey,
        }))

        if (tracks.length > 0) {
          await playPlexAlbum(tracks)
        }
      } catch (err) {
        console.error('[usePlexMusic] Failed to play artist:', err)
      }
    },
    [activeServerId, browseData?.serverId, playPlexAlbum],
  )

  return {
    sections,
    activeSectionId,
    activeServerId,
    setSelectedSectionId,
    browseType,
    setBrowseType,
    searchQuery,
    setSearchQuery,
    limit,
    setLimit,
    offset,
    setOffset,
    totalCount: browseData?.totalCount ?? browseData?.items?.length ?? 0,
    items: browseData?.items || [],
    baseUrl: browseData?.baseUrl,
    token: browseData?.token,
    isLoading: isLoadingSections || isLoadingBrowse,
    isFetching: isFetchingBrowse,
    isDiscovering,
    discoverSections,
    refetchBrowse,
    playPlexItem,
    playPlexItems,
    playPlexAlbumByRatingKey,
    playPlexArtistByRatingKey,
  }
}
