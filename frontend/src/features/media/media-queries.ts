import { queryOptions, infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { UserInteractionState } from '@/features/interaction/interaction-queries'
import { mediaKeys, type SearchParams } from './media-keys'

export interface MediaItemSummary {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl: string | null
  textlessPosterUrl: string | null
  logoUrl: string | null
  releaseDate: string | null
  popularity: number
  avgRating?: number | null
  ratingCount: number
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount?: number
  listenedCount?: number
  viewCount: number
  isAdult?: boolean
  userInteractions?: UserInteractionState | null
  revenue?: number | null
  budget?: number | null
  albumMusicbrainzReleaseGroupId?: string | null
  albumArtistName?: string | null
}

export interface WatchProvider {
  id: string
  name: string
  slug: string
  logoUrl: string | null
}

export interface MediaWatchProvider {
  id: string
  watchProvider: WatchProvider
  countryCode: string
  offeringType: string
  url: string | null
  displayPriority: number
}

export interface MediaItemDetail {
  id: string
  mediaType: string
  title: string
  slug: string
  overview: string | null
  posterUrl: string | null
  textlessPosterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  releaseDate: string | null
  popularity: number
  originalLanguage: string | null
  completenessScore: number
  avgRating?: number | null
  ratingCount: number
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount?: number
  listenedCount?: number
  viewCount: number
  isAdult?: boolean
  userInteractions?: UserInteractionState | null
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  steamRtimeLastPlayed?: number | null
  youtubeVideoId?: string | null
  createdAt: string
  updatedAt: string
  genres: Array<{ id: string; name: string; slug: string }>
  externalRatings: Array<{ id: string; provider: string; score: number; maxScore: number; voteCount?: number }>
  credits: Array<{
    id: string
    person: { id: string; name: string; photoUrl?: string }
    role: string
    characterName?: string
    sortOrder: number
  }>
  involvedCompanies: Array<{
    id: string
    company: { id: string; name: string; slug: string; logoUrl: string | null }
    developer: boolean
    publisher: boolean
    porting: boolean
    supporting: boolean
    production: boolean
  }>
  releases: Array<{
    countryCode: string
    releaseDate: string | null
    certification: string | null
  }>
  platforms: Array<{ id: string; platform: { id: string; name: string; slug: string; logoImageId?: string } }>
  gameModes: Array<{ id: string; gameMode: { id: string; name: string; slug: string } }>
  watchProviders: MediaWatchProvider[]
  collection?: {
    id: string
    name: string
    overview: string | null
    posterUrl: string | null
    backdropUrl: string | null
    movies: Array<{
      id: string
      title: string
      posterUrl: string | null
      releaseDate: string | null
      slug: string
    }>
  } | null
  movie?: MovieDetail
  show?: ShowDetail
  game?: GameDetail
  album?: AlbumDetail
}

export interface MovieDetail {
  runtime?: number
  budget?: number
  revenue?: number
  revenueRank?: number
  profitPct?: number
  profitRank?: number
  lossRank?: number
  tagline?: string
  isAnime: boolean
}

export interface ExternalRatingOut {
  id: string
  provider: string
  score: number
  maxScore: number
  voteCount?: number | null
}

export interface EpisodeOut {
  id: string
  episodeNumber: number
  name?: string | null
  overview?: string | null
  runtime?: number | null
  airDate?: string | null
  stillUrl?: string | null
  externalRatings: ExternalRatingOut[]
}

export interface SeasonOut {
  id: string
  seasonNumber: number
  name?: string | null
  overview?: string | null
  posterUrl?: string | null
  episodeCount: number
  episodes: EpisodeOut[]
}

export interface ShowDetail {
  status?: string
  firstAirDate?: string
  lastAirDate?: string
  numberOfSeasons?: number
  numberOfEpisodes?: number
  isAnime: boolean
  seasons: SeasonOut[]
}

export interface GameDetail {
  releaseStatus?: string
  website?: string
  steamAppId?: number
  storeIds?: Record<string, string | number>
  currentPlayers?: number
  priceJson?: Record<string, unknown>
  recommendations?: number
  reviewSummary?: string
  isFree: boolean
  hasMultiplayer: boolean
}

export interface TrackOut {
  id: string
  trackNumber: number
  discNumber: number
  title: string
  durationMs?: number | null
  previewUrl?: string | null
  spotifyId?: string | null
  musicbrainzRecordingId?: string | null
  audioFeatures?: Record<string, unknown> | null
  avgRating?: number | null
  ratingCount: number
}

export interface TrackRatingOut {
  userId: string
  trackId: string
  score: number
  avgRating: number | null
  ratingCount: number
  createdAt: string
  updatedAt: string
}

export interface AlbumDetail {
  releaseType: string
  format?: string | null
  catalogNumber?: string | null
  barcode?: string | null
  trackCount: number
  discCount: number
  durationMs?: number | null
  spotifyId?: string | null
  musicbrainzId?: string | null
  musicbrainzReleaseGroupId?: string | null
  spotifyUrl?: string | null
  spotifyPopularity?: number | null
  previewUrl?: string | null
  audioFeatures?: Record<string, unknown> | null
  tracks: TrackOut[]
}

export interface TrackSearchResult {
  id: string
  title: string
  trackNumber: number
  discNumber: number
  durationMs: number | null
  previewUrl: string | null
  spotifyId: string | null
  avgRating: number | null
  ratingCount: number
  albumId: string
  albumTitle: string
  albumPosterUrl: string | null
  albumArtistName: string | null
  albumSlug: string
}

export interface MediaListResponse {
  items: MediaItemSummary[]
  tracks: TrackSearchResult[]
  nextCursor: string | null
  hasMore: boolean
  total?: number | null
  backfillPending?: boolean
}

export const mediaQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: mediaKeys.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<MediaItemDetail>(`/media/${id}`)
        return data
      },
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 30,
    }),

  list: (opts?: {
    type?: string
    genre?: string
    company?: string
    language?: string
    isAnime?: boolean | null
    hasArtwork?: boolean
    sortBy?: string
    sortDir?: string
    page?: number
    limit?: number
    personId?: string
    creditRole?: string
  }) =>
    queryOptions({
      queryKey: mediaKeys.list(opts?.type, opts),
      queryFn: async () => {
        const params: Record<string, string | number | boolean> = { limit: opts?.limit ?? 50 }
        if (opts?.type) params.media_type = opts.type
        if (opts?.genre) params.genre = opts.genre
        if (opts?.company) params.company = opts.company
        if (opts?.certification) params.certification = opts.certification
        if (opts?.language) params.language = opts.language
        if (opts?.isAnime != null) params.is_anime = opts.isAnime
        if (opts?.hasArtwork) params.has_artwork = true
        if (opts?.sortBy) {
          params.sort_by = opts.sortBy
          if (opts?.sortDir) params.sort_dir = opts.sortDir
          if (opts?.page) params.page = opts.page
        }
        if (opts?.personId) {
          params.person_id = opts.personId
          if (opts?.creditRole) params.credit_role = opts.creditRole
        }
        const { data } = await apiClient.get<MediaListResponse>('/media', { params })
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),

  infiniteList: (opts?: {
    type?: string
    genre?: string
    company?: string
    language?: string
    isAnime?: boolean | null
    hasArtwork?: boolean
    sortBy?: string
    sortDir?: string
    limit?: number
  }) =>
    infiniteQueryOptions({
      queryKey: mediaKeys.infiniteList(opts?.type, opts),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string | number | boolean> = { limit: opts?.limit ?? 48 }
        if (opts?.type) params.media_type = opts.type
        if (opts?.genre) params.genre = opts.genre
        if (opts?.company) params.company = opts.company
        if (opts?.certification) params.certification = opts.certification
        if (opts?.language) params.language = opts.language
        if (opts?.isAnime != null) params.is_anime = opts.isAnime
        if (opts?.hasArtwork) params.has_artwork = true
        if (opts?.sortBy) {
          params.sort_by = opts.sortBy
          if (opts?.sortDir) params.sort_dir = opts.sortDir
        }
        params.page = pageParam
        const { data } = await apiClient.get<MediaListResponse>('/media', { params })
        return data
      },
      getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length + 1 : undefined,
      initialPageParam: 1,
      staleTime: 1000 * 60 * 5,
    }),

  search: (params: Omit<SearchParams, 'page'>) =>
    infiniteQueryOptions({
      queryKey: mediaKeys.search(params),
      queryFn: async ({ pageParam }) => {
        const searchParams: Record<string, string> = {
          q: params.query,
          page: String(pageParam),
          page_size: '24',
        }
        if (params.type) searchParams.media_type = params.type
        if (params.sortBy) searchParams.sort_by = params.sortBy
        const { data } = await apiClient.get<MediaListResponse>('/media/search', { params: searchParams })
        return data
      },
      getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
      initialPageParam: 1,
      staleTime: 1000 * 60 * 5,
      enabled: params.query.length > 0,
    }),

  pollSearch: (params: Omit<SearchParams, 'page'> & { knownIds: string }) =>
    queryOptions({
      queryKey: mediaKeys.searchPoll(params),
      queryFn: async () => {
        const searchParams: Record<string, string> = {
          q: params.query,
          page_size: '24',
        }
        if (params.type) searchParams.media_type = params.type
        if (params.knownIds) searchParams.known_ids = params.knownIds
        const { data } = await apiClient.get<MediaListResponse>('/media/search/poll', { params: searchParams })
        return data
      },
      staleTime: 2000,
      enabled: params.query.length > 0,
    }),

  similar: (id: string, opts?: { mediaType?: string; limit?: number }) =>
    queryOptions({
      queryKey: mediaKeys.similar(id, opts?.mediaType),
      queryFn: async () => {
        const params: Record<string, string | number> = { limit: opts?.limit ?? 20 }
        if (opts?.mediaType) params.media_type = opts.mediaType
        const { data } = await apiClient.get<MediaListResponse>(`/media/${id}/similar`, { params })
        return data
      },
      staleTime: 1000 * 60 * 60 * 24, // 1 day — embeddings are deterministic
      gcTime: 1000 * 60 * 60 * 24 * 7, // keep in cache for 7 days
    }),

  recommendations: (id: string, opts?: { limit?: number }) =>
    queryOptions({
      queryKey: mediaKeys.recommendations(id),
      queryFn: async () => {
        const params: Record<string, number> = { limit: opts?.limit ?? 20 }
        const { data } = await apiClient.get<MediaListResponse>(`/media/${id}/recommendations`, { params })
        return data
      },
      staleTime: 1000 * 60 * 60 * 24, // 1 day — embeddings are deterministic
      gcTime: 1000 * 60 * 60 * 24 * 7,
    }),
}

export function useRateTrack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ trackId, score }: { trackId: string; score: number }) => {
      const { data } = await apiClient.put<TrackRatingOut>(`/tracks/${trackId}/rating`, { score })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all() })
    },
  })
}
