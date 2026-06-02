import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient, API_BASE_URL } from "@/lib/api-client"
import { libraryKeys } from "./library-keys"

export interface LibraryResponse {
  items: Array<{
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    textlessPosterUrl: string | null
    logoUrl: string | null
    releaseDate: string | null
    popularity: number
    likeCount: number
    watchlistCount: number
    watchedCount: number
    playedCount: number
    userInteractions?: {
      liked: boolean
      watchlisted: boolean
      watched: boolean
      played: boolean
    } | null
    steamPlaytimeForever?: number | null
    steamPlaytime2weeks?: number | null
    steamRtimeLastPlayed?: number | null
    plexViewCount?: number | null
    plexLastViewedAt?: string | null
    albumArtistName?: string | null
    albumTrackCount?: number | null
    isAdult?: boolean
  }>
  nextCursor: string | null
  hasMore: boolean
}

export const LIBRARY_TABS = ["overview", "watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

export const TAB_LABELS: Record<LibraryTab, string> = {
  overview: "Overview",
  watchlist: "Watchlist",
  like: "Liked",
  watched: "Watched",
  played: "Played",
  listened: "Listened",
  spotify: "Spotify",
  steam: "Steam",
  plex: "Plex",
  wishlist: "Wishlist",
  lists: "Lists",
}

export function useLibraryTab(tab: LibraryTab, extraParams?: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: libraryKeys.tab(tab, extraParams),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "48", ...extraParams }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<LibraryResponse>("/library/" + tab, { params })
      return data
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  })
}

export function useSteamLibraryScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ totalInSteam: number; matchedInOtix: number }>(
        "/auth/integrations/steam/scan",
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("steam") })
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("steam"), "status"] })
    },
  })
}

export interface PlexSyncResult {
  total: number
  matched: number
  seeded: number
  servers?: number
  libraries?: number
}

/**
 * Shared helper: POST /plex/sync → open SSE stream → await sync_complete or error.
 * Resolves with the final PlexSyncResult so callers get meaningful data.
 * Calls `onEvent` for each progress event (optional, for UI feedback).
 */
export async function streamPlexSync(
  onEvent?: (event: { type: string; [key: string]: unknown }) => void,
): Promise<PlexSyncResult> {
  const { data } = await apiClient.post<{ taskId: string }>("/auth/integrations/plex/sync")
  const token = localStorage.getItem("otix-access-token")

  const response = await fetch(
    `${API_BASE_URL}/auth/integrations/plex/sync/${data.taskId}/stream`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  )

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const convertToCamel = (str: string) =>
    str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

  const camelCaseKeys = (obj: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [convertToCamel(k), v]),
    )

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue
        // Skip SSE keep-alive comments
        if (line.trim() === "data:") continue
        let event: Record<string, unknown>
        try {
          event = camelCaseKeys(JSON.parse(line.slice(6)))
        } catch {
          continue
        }
        onEvent?.(event as { type: string; [key: string]: unknown })
        if (event.type === "sync_complete") {
          return {
            total: (event.total as number) ?? 0,
            matched: (event.matched as number) ?? 0,
            seeded: (event.seeded as number) ?? 0,
            servers: event.servers as number | undefined,
            libraries: event.libraries as number | undefined,
          }
        }
        if (event.type === "error") {
          throw new Error((event.message as string) ?? "Plex sync failed")
        }
      }
    }
  }

  // Stream closed without a sync_complete — treat as success with zeros
  return { total: 0, matched: 0, seeded: 0 }
}

export function usePlexLibraryScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => streamPlexSync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("plex") })
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("plex"), "status"] })
    },
  })
}


export function usePlexStatus({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...libraryKeys.tab("plex"), "status"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ itemCount: number; lastScannedAt: string | null }>(
        "/library/plex/status",
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled,
  })
}

export interface UnmatchedGame {
  id: string
  steamAppId: number
  steamName: string
  steamPlaytimeForever: number
  steamPlaytime2weeks: number
  steamImgIconUrl: string | null
  steamRtimeLastPlayed: number | null
}

export interface UnmatchedListResponse {
  items: UnmatchedGame[]
  nextCursor: string | null
  hasMore: boolean
}

export function useUnmatchedSteamGames() {
  return useInfiniteQuery({
    queryKey: [...libraryKeys.tab("steam"), "unmatched"],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "48" }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<UnmatchedListResponse>("/library/steam/unmatched", { params })
      return data
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  })
}

export function useSteamStatus({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...libraryKeys.tab("steam"), "status"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ gameCount: number; lastScannedAt: string | null }>(
        "/library/steam/status",
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled,
  })
}

export interface WishlistItem {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl: string | null
  logoUrl: string | null
  textlessPosterUrl: string | null
  releaseDate: string | null
  steamPriority: number
  isAdult?: boolean
}

export interface WishlistListResponse {
  items: WishlistItem[]
  nextCursor: string | null
  hasMore: boolean
}

export function useSteamWishlist() {
  return useInfiniteQuery({
    queryKey: libraryKeys.tab("wishlist"),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "48" }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<WishlistListResponse>("/library/steam/wishlist", { params })
      return data
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  })
}

export function useSpotifyLibraryScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ taskId: string }>(
        "/auth/integrations/spotify/sync",
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("spotify") })
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("spotify"), "status"] })
    },
  })
}

export function useSpotifyStatus({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...libraryKeys.tab("spotify"), "status"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ trackCount: number; lastScannedAt: string | null }>(
        "/library/spotify/status",
      )
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled,
  })
}

export interface SpotifyTrack {
  id: string
  name: string
  artist: string
  artistId?: string | null
  albumName: string
  albumId?: string | null
  albumArt: string | null
  durationMs: number | null
  uri: string
  previewUrl: string | null
  spotifyLiked?: boolean
  otixTrackId?: string | null
  otixAlbumId?: string | null
  otixArtistId?: string | null
  avgRating?: number | null
  ratingCount?: number
}

export interface SpotifyLikedTracks {
  tracks: SpotifyTrack[]
  total: number
  nextOffset: number | null
  hasMore: boolean
}

export function getSpotifyLikedTracksNextPageParam(lastPage: SpotifyLikedTracks) {
  return lastPage.nextOffset ?? undefined
}

export function useSpotifyLikedTracks() {
  return useInfiniteQuery({
    queryKey: [...libraryKeys.tab("spotify"), "liked-tracks"],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const params: Record<string, string> = {
        limit: "50",
        offset: String(pageParam),
      }
      const { data } = await apiClient.get<SpotifyLikedTracks>(
        "/library/spotify/tracks",
        { params },
      )
      return data
    },
    initialPageParam: 0,
    getNextPageParam: getSpotifyLikedTracksNextPageParam,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSaveSpotifyTrack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (trackId: string) => {
      const { data } = await apiClient.put<{ id: string; spotifyLiked: boolean }>(
        `/library/spotify/tracks/${trackId}/liked`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("spotify"), "liked-tracks"] })
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("spotify") })
    },
  })
}

export function useSteamWishlistScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ total: number; matched: number; private?: boolean }>(
        "/auth/integrations/steam/wishlist/scan",
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("wishlist") })
    },
  })
}

export interface PlexAlbumTrack {
  ratingKey: string
  title: string
  artist: string
  trackNumber: number
  discNumber: number
  durationMs: number | null
  streamUrl: string | null
}

export interface PlexAlbumTracksResult {
  tracks: PlexAlbumTrack[]
  baseUrl: string
  baseUrls: string[]
  token: string
  ratingKey: string
  albumThumbUrl: string | null
}

export function usePlexAlbumTracks(mediaItemId: string | undefined) {
  return useQuery({
    queryKey: ["plex", "album-tracks", "v2", mediaItemId],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexAlbumTracksResult>(
        `/auth/integrations/plex/album-tracks/${mediaItemId}`,
      )
      return data
    },
    enabled: !!mediaItemId,
    staleTime: 1000 * 60 * 2,
  })
}