// TODO: Review this file
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"
import { API_BASE_URL, ACCESS_TOKEN_KEY } from "@/lib/config"
import { connectTaskSseStream, createSseStream, type SseEvent } from "@/lib/api/sse-client"
import { getScannedGames, setScannedGames } from "@/old-features/game-scanner/storage"
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
      owned: boolean
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

export const LIBRARY_TABS = ["overview", "games", "watchlist", "like", "watched", "played", "listened", "owned", "spotify", "steam", "plex", "wishlist", "lists"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

export const TAB_LABELS: Record<LibraryTab, string> = {
  overview: "Overview",
  watchlist: "Watchlist",
  like: "Liked",
  watched: "Watched",
  played: "Played",
  listened: "Listened",
  owned: "Owned",
  spotify: "Spotify",
  steam: "Steam",
  plex: "Plex",
  wishlist: "Wishlist",
  lists: "Lists",
  games: "Games",
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
        "/integrations/steam/scan",
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
 * Shared helper: POST /plex/sync → SSE stream → await sync_complete or error.
 * Resolves with the final PlexSyncResult so callers get meaningful data.
 * Calls `onEvent` for each progress event (optional, for UI feedback).
 */
export async function streamPlexSync(
  onEvent?: (event: { type: string; [key: string]: unknown }) => void,
): Promise<PlexSyncResult> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ""

  const terminal = await connectTaskSseStream(
    {
      createEndpoint: "/integrations/plex/sync",
      streamEndpoint: (taskId: string) => `/integrations/plex/sync/${taskId}/stream`,
      terminalEvents: ["sync_complete", "error"],
      token,
    },
    onEvent as (event: { type: string; [key: string]: unknown }) => void,
  )

  if (terminal.type === "error") {
    throw new Error((terminal.message as string) ?? "Plex sync failed")
  }

  return {
    total: (terminal.total as number) ?? 0,
    matched: (terminal.matched as number) ?? 0,
    seeded: (terminal.seeded as number) ?? 0,
    servers: terminal.servers as number | undefined,
    libraries: terminal.libraries as number | undefined,
  }
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

export interface PlexLibraryInfo {
  id: string
  serverId: string
  serverName: string
  sectionKey: string
  title: string
  libraryType: string  // "movie", "show", "artist"
  selected: boolean
  itemCount: number
  lastSyncedAt: string | null
}

export function usePlexLibraries({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...libraryKeys.tab("plex"), "libraries"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ libraries: PlexLibraryInfo[] }>(
        "/integrations/plex/libraries",
      )
      return data.libraries
    },
    staleTime: 1000 * 60,
    enabled,
  })
}

/**
 * Sync a single Plex library and stream progress via SSE.
 * Resolves with the final PlexSyncResult.
 */
export async function streamPlexLibrarySync(
  libraryId: string,
  onEvent?: (event: { type: string; [key: string]: unknown }) => void,
): Promise<PlexSyncResult> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ""

  // POST with library_id body — can't use connectTaskSseStream because
  // it doesn't send a request body.
  const { data: createData } = await apiClient.post<{ taskId: string }>(
    "/integrations/plex/sync",
    { library_id: libraryId },
  )

  const stream = createSseStream({
    url: `${API_BASE_URL}/integrations/plex/sync/${createData.taskId}/stream`,
    token,
  })

  let lastEvent: SseEvent = { type: "unknown" }
  for await (const event of stream) {
    onEvent?.(event)
    lastEvent = event
    if (event.type === "sync_complete" || event.type === "error") {
      break
    }
  }

  if (lastEvent.type === "error") {
    throw new Error((lastEvent.message as string) ?? "Plex library sync failed")
  }

  return {
    total: (lastEvent.total as number) ?? 0,
    matched: (lastEvent.matched as number) ?? 0,
    seeded: (lastEvent.seeded as number) ?? 0,
    servers: lastEvent.servers as number | undefined,
    libraries: lastEvent.libraries as number | undefined,
  }
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
        "/integrations/spotify/sync",
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
        "/integrations/steam/wishlist/scan",
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("wishlist") })
    },
  })
}

// ── Helpers ─────────────────────────────────────────────────────────

function cleanupStaleMediaRef(mediaId: string) {
  const games = getScannedGames()
  const updated = games.map((g) => {
    if (g.data?.id === mediaId || g.matchSuggestion?.id === mediaId) {
      const { otixMediaId, otixMediaTitle, otixMediaSlug, otixPosterUrl, otixTextlessPosterUrl, otixLogoUrl, otixMatchSuggestion, otixConfidence, otixClaimed, otixMatchVerified, ...rest } = g
      return rest as typeof g
    }
    return g
  })
  setScannedGames(updated)
}

// ── Claim / unclaim game (owned) ───────────────────────────────────

export function useClaimGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mediaType, mediaId }: { mediaType: string; mediaId: string }) => {
      const { data } = await apiClient.post<{ status: string }>(`/media/${mediaType}/${mediaId}/claim`)
      return data
    },
    onSuccess: (_data, { mediaId }) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("owned") })
      queryClient.invalidateQueries({ queryKey: ["games", "detail", mediaId] })
    },
    onError: (_err, { mediaId }) => {
      // If the media item doesn't exist, clean up stale references from local storage
      cleanupStaleMediaRef(mediaId)
    },
  })
}

export function useUnclaimGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mediaType, mediaId }: { mediaType: string; mediaId: string }) => {
      await apiClient.delete(`/media/${mediaType}/${mediaId}/claim`)
    },
    onSuccess: (_data, { mediaId }) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("owned") })
      queryClient.invalidateQueries({ queryKey: ["games", "detail", mediaId] })
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
  token: string
  ratingKey: string
  albumThumbUrl: string | null
}

export function usePlexAlbumTracks(mediaItemId: string | undefined) {
  return useQuery({
    queryKey: ["plex", "album-tracks", "v2", mediaItemId],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexAlbumTracksResult>(
        `/integrations/plex/album-tracks/${mediaItemId}`,
      )
      return data
    },
    enabled: !!mediaItemId,
    staleTime: 1000 * 60 * 2,
  })
}