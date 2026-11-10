import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLocalMusic } from '../local/hooks/use-local-music'
import { usePlexMusic, type PlexBrowseItem } from '../plex/hooks/use-plex-music'
import { usePlayer } from '@/lib/player/use-player'
import { useDebounceValue } from './use-debounce'
import { getOrCreateBlobUrl } from '../utils/blob-url-cache'
import type { StoredLocalTrack } from '../local/utils/local-music-db'

export type MusicViewMode = 'albums' | 'artists' | 'tracks'
export type MusicSourceFilter = 'all' | 'plex' | 'local'

export interface UnifiedAlbum {
  id: string
  title: string
  artist: string
  thumbUrl: string | null
  year: number | string | null
  trackCount: number | null
  source: 'plex' | 'local'
  ratingKey?: string
  serverId?: number | null
  tracks?: StoredLocalTrack[]
}

export interface UnifiedArtist {
  id: string
  name: string
  thumbUrl: string | null
  source: 'plex' | 'local' | 'both'
  ratingKey?: string
  serverId?: number | null
  localAlbums?: Array<{
    title: string
    artist: string
    thumbUrl: string | null
    year: number | string | null
  }>
  localTracks?: StoredLocalTrack[]
}

export interface UnifiedTrack {
  id: string
  title: string
  artist: string
  albumName: string
  thumbUrl: string | null
  durationMs: number
  trackNumber: number | null
  source: 'plex' | 'local'
  ratingKey?: string
  rawLocalTrack?: StoredLocalTrack
  rawPlexItem?: PlexBrowseItem
}

export const useUnifiedMusic = () => {
  const localMusic = useLocalMusic()
  const plexMusic = usePlexMusic()
  const { currentTrack, isPlaying } = usePlayer()

  const [viewMode, setViewMode] = useState<MusicViewMode>('albums')
  const [sourceFilter, setSourceFilter] = useState<MusicSourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounceValue(searchQuery, 300)

  const { setSearchQuery: setPlexSearchQuery, setBrowseType: setPlexBrowseType } = plexMusic

  // Sync debounced search to Plex music hook
  useEffect(() => {
    setPlexSearchQuery(debouncedSearch)
  }, [debouncedSearch, setPlexSearchQuery])

  // Sync Plex browse type to active viewMode so Plex queries the right dataset
  useEffect(() => {
    if (viewMode === 'albums' && plexMusic.browseType !== 'albums') {
      setPlexBrowseType('albums')
    } else if (viewMode === 'artists' && plexMusic.browseType !== 'artists') {
      setPlexBrowseType('artists')
    } else if (viewMode === 'tracks' && plexMusic.browseType !== 'tracks') {
      setPlexBrowseType('tracks')
    }
  }, [viewMode, plexMusic.browseType, setPlexBrowseType])

  // Pre-index local tracks by album for O(1) lookup
  const tracksByAlbum = useMemo(() => {
    const map = new Map<string, StoredLocalTrack[]>()
    for (const track of localMusic.tracks) {
      const key = track.albumName || 'Unknown Album'
      const existing = map.get(key)
      if (existing) {
        existing.push(track)
      } else {
        map.set(key, [track])
      }
    }
    return map
  }, [localMusic.tracks])

  // Pre-index local tracks by artist for O(1) lookup
  const tracksByArtist = useMemo(() => {
    const map = new Map<string, StoredLocalTrack[]>()
    for (const track of localMusic.tracks) {
      const key = (track.artist || 'Unknown Artist').toLowerCase()
      const existing = map.get(key)
      if (existing) {
        existing.push(track)
      } else {
        map.set(key, [track])
      }
    }
    return map
  }, [localMusic.tracks])

  // Map local albums with cover art blobs resolved and O(1) track lookup
  const localAlbums = useMemo<UnifiedAlbum[]>(() => {
    return localMusic.albums.map((a) => {
      const artUrl = getOrCreateBlobUrl(a.albumArtBlob)
      const albumTracks = tracksByAlbum.get(a.albumName) ?? []
      return {
        id: `local-album-${a.albumName}-${a.artist}`,
        title: a.albumName,
        artist: a.artist,
        thumbUrl: artUrl,
        year: a.year,
        trackCount: a.trackCount,
        source: 'local',
        tracks: albumTracks,
      }
    })
  }, [localMusic.albums, tracksByAlbum])

  // Pre-index local albums by artist for O(1) lookup
  const albumsByArtist = useMemo(() => {
    const map = new Map<string, UnifiedAlbum[]>()
    for (const album of localAlbums) {
      const key = (album.artist || 'Unknown Artist').toLowerCase()
      const existing = map.get(key)
      if (existing) {
        existing.push(album)
      } else {
        map.set(key, [album])
      }
    }
    return map
  }, [localAlbums])

  // Map Plex albums
  const plexAlbums = useMemo<UnifiedAlbum[]>(() => {
    if (plexMusic.browseType !== 'albums') return []
    return plexMusic.items.map((item) => ({
      id: `plex-album-${item.ratingKey}`,
      title: item.title,
      artist: item.artist,
      thumbUrl: item.thumbUrl,
      year: item.year,
      trackCount: item.trackCount,
      source: 'plex',
      ratingKey: item.ratingKey,
      serverId: plexMusic.activeServerId,
    }))
  }, [plexMusic.browseType, plexMusic.items, plexMusic.activeServerId])

  // Merged and filtered albums with debounced search
  const albums = useMemo<UnifiedAlbum[]>(() => {
    let list: UnifiedAlbum[]
    if (sourceFilter === 'all') {
      list = [...localAlbums, ...plexAlbums]
    } else if (sourceFilter === 'local') {
      list = localAlbums
    } else {
      list = plexAlbums
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
      )
    }

    return list.sort((a, b) => a.title.localeCompare(b.title))
  }, [localAlbums, plexAlbums, sourceFilter, debouncedSearch])

  // Map local artists with O(1) lookups
  const localArtists = useMemo<UnifiedArtist[]>(() => {
    return localMusic.artists.map((name) => {
      const key = name.toLowerCase()
      const artistTracks = tracksByArtist.get(key) ?? []
      const rawAlbums = albumsByArtist.get(key) ?? []
      const artistAlbums = rawAlbums.map((a) => ({
        title: a.title,
        artist: a.artist,
        thumbUrl: a.thumbUrl,
        year: a.year,
      }))
      const thumbUrl = artistAlbums.find((a) => a.thumbUrl)?.thumbUrl ?? null
      return {
        id: `local-artist-${name}`,
        name,
        thumbUrl,
        source: 'local',
        localAlbums: artistAlbums,
        localTracks: artistTracks,
      }
    })
  }, [localMusic.artists, tracksByArtist, albumsByArtist])

  // Map Plex artists
  const plexArtists = useMemo<UnifiedArtist[]>(() => {
    if (plexMusic.browseType !== 'artists') return []
    return plexMusic.items.map((item) => ({
      id: `plex-artist-${item.ratingKey}`,
      name: item.title,
      thumbUrl: item.thumbUrl,
      source: 'plex',
      ratingKey: item.ratingKey,
      serverId: plexMusic.activeServerId,
    }))
  }, [plexMusic.browseType, plexMusic.items, plexMusic.activeServerId])

  // Merged and filtered artists with debounced search
  const artists = useMemo<UnifiedArtist[]>(() => {
    let list: UnifiedArtist[]
    if (sourceFilter === 'all') {
      list = [...localArtists, ...plexArtists]
    } else if (sourceFilter === 'local') {
      list = localArtists
    } else {
      list = plexArtists
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q))
    }

    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [localArtists, plexArtists, sourceFilter, debouncedSearch])

  // Pre-index album art URLs to avoid eager blob creation for 30k+ tracks
  const albumArtUrlMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (let i = 0; i < localAlbums.length; i++) {
      const alb = localAlbums[i]
      if (alb.thumbUrl) {
        map.set(alb.title, alb.thumbUrl)
        map.set(`${alb.artist}-${alb.title}`, alb.thumbUrl)
      }
    }
    return map
  }, [localAlbums])

  const { tracks: rawLocalTracks } = localMusic

  // Map local tracks with O(1) album art lookup and zero object URL churn
  const localTracks = useMemo<UnifiedTrack[]>(() => {
    return rawLocalTracks.map((t) => {
      const art =
        albumArtUrlMap.get(`${t.artist}-${t.albumName}`) ??
        albumArtUrlMap.get(t.albumName) ??
        null

      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        albumName: t.albumName,
        thumbUrl: art,
        durationMs: t.durationMs,
        trackNumber: t.trackNumber,
        source: 'local',
        rawLocalTrack: t,
      }
    })
  }, [rawLocalTracks, albumArtUrlMap])

  // Map Plex tracks
  const plexTracks = useMemo<UnifiedTrack[]>(() => {
    if (plexMusic.browseType !== 'tracks') return []
    return plexMusic.items.map((item) => ({
      id: item.ratingKey,
      title: item.title,
      artist: item.artist,
      albumName: item.title,
      thumbUrl: item.thumbUrl,
      durationMs: item.durationMs || 0,
      trackNumber: null,
      source: 'plex',
      ratingKey: item.ratingKey,
      rawPlexItem: item,
    }))
  }, [plexMusic.browseType, plexMusic.items])

  // Merged and filtered tracks with debounced search
  const tracks = useMemo<UnifiedTrack[]>(() => {
    let list: UnifiedTrack[]
    if (sourceFilter === 'all') {
      list = [...localTracks, ...plexTracks]
    } else if (sourceFilter === 'local') {
      list = localTracks
    } else {
      list = plexTracks
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.albumName.toLowerCase().includes(q),
      )
    }

    return list
  }, [localTracks, plexTracks, sourceFilter, debouncedSearch])

  // Total library statistics
  const stats = useMemo(() => {
    const plexTrackCount = plexMusic.browseType === 'tracks' ? plexMusic.items.length : 0
    const plexAlbumCount = plexMusic.browseType === 'albums' ? plexMusic.items.length : 0
    const plexArtistCount = plexMusic.browseType === 'artists' ? plexMusic.items.length : 0
    return {
      totalTracks: localMusic.tracks.length + plexTrackCount,
      totalAlbums: localMusic.albums.length + plexAlbumCount,
      totalArtists: localMusic.artists.length + plexArtistCount,
      localTracksCount: localMusic.tracks.length,
      plexTracksCount: plexMusic.items.length,
    }
  }, [
    localMusic.tracks.length,
    localMusic.albums.length,
    localMusic.artists.length,
    plexMusic.browseType,
    plexMusic.items.length,
  ])

  const {
    playTracksInContext: playLocalTracksInContext,
    playAlbum: playLocalAlbum,
    playArtist: playLocalArtist,
  } = localMusic

  const {
    playPlexItems,
    playPlexAlbumByRatingKey,
    playPlexArtistByRatingKey,
  } = plexMusic

  // Play track in context: automatically builds playlist queue starting from clicked song
  const playTrackInContext = useCallback(
    async (track: UnifiedTrack, contextList: UnifiedTrack[]) => {
      if (track.source === 'local') {
        const localList = contextList.filter((t) => t.source === 'local' && t.rawLocalTrack)
        const localIdx = localList.findIndex((t) => t.id === track.id)
        const rawList = localList.map((t) => t.rawLocalTrack!)
        await playLocalTracksInContext(rawList, Math.max(0, localIdx))
      } else {
        const plexList = contextList.filter((t) => t.source === 'plex' && t.rawPlexItem)
        const plexIdx = plexList.findIndex((t) => t.id === track.id)
        const rawItems = plexList.map((t) => t.rawPlexItem!)
        await playPlexItems(rawItems, Math.max(0, plexIdx))
      }
    },
    [playLocalTracksInContext, playPlexItems],
  )

  // Play album in context: automatically queues all album tracks
  const playAlbumInContext = useCallback(
    async (album: UnifiedAlbum, startIndex = 0) => {
      if (album.source === 'local') {
        if (album.tracks && album.tracks.length > 0) {
          await playLocalTracksInContext(album.tracks, startIndex)
        } else {
          await playLocalAlbum(album.title, startIndex)
        }
      } else if (album.ratingKey) {
        await playPlexAlbumByRatingKey(
          album.ratingKey,
          album.title,
          album.artist,
          album.thumbUrl,
        )
      }
    },
    [playLocalAlbum, playLocalTracksInContext, playPlexAlbumByRatingKey],
  )

  // Play artist in context: automatically queues all artist tracks
  const playArtistInContext = useCallback(
    async (artist: UnifiedArtist, startIndex = 0) => {
      if (artist.source === 'local') {
        await playLocalArtist(artist.name, startIndex)
      } else if (artist.ratingKey) {
        await playPlexArtistByRatingKey(
          artist.ratingKey,
          artist.name,
          artist.thumbUrl,
        )
      }
    },
    [playLocalArtist, playPlexArtistByRatingKey],
  )

  return {
    viewMode,
    setViewMode,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
    albums,
    artists,
    tracks,
    stats,
    currentTrack,
    isPlaying,
    isLoading: localMusic.isLoading || plexMusic.isLoading,
    isScanning: localMusic.isScanning,
    scanProgress: localMusic.scanProgress,
    folders: localMusic.folders,
    scanDirectory: localMusic.scanDirectory,
    removeFolder: localMusic.removeFolder,
    clearLocalLibrary: localMusic.clearAll,
    sections: plexMusic.sections,
    activeSectionId: plexMusic.activeSectionId,
    activeServerId: plexMusic.activeServerId,
    setSelectedSectionId: plexMusic.setSelectedSectionId,
    discoverSections: plexMusic.discoverSections,
    isDiscovering: plexMusic.isDiscovering,
    playTrackInContext,
    playAlbumInContext,
    playArtistInContext,
    playAllLocal: localMusic.playAll,
  }
}
