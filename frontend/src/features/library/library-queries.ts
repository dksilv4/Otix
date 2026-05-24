import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
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

export function useLibraryTab(tab: LibraryTab) {
  return useInfiniteQuery({
    queryKey: libraryKeys.tab(tab),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "48" }
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

export function usePlexLibraryScan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ total: number; matched: number; seeded: number }>(
        "/auth/integrations/plex/sync",
      )
      return data
    },
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
  albumName: string
  albumArt: string | null
  durationMs: number | null
  uri: string
  previewUrl: string | null
  spotifyLiked?: boolean
  otixTrackId?: string | null
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
