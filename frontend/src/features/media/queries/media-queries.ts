import { queryOptions, infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, getResolvedTheme } from '@/lib/api/client'
import type { UserInteractionState } from '@/features/interaction/interaction-queries'
import { mediaKeys, type SearchParams } from './media-keys'

export interface MediaItemSummary {
  id: string
  mediaType: string
  title: string
  slug: string
  /** TMDB external id (movie/show) — lets desktop plugins address the item. */
  tmdbId?: string | null
  posterUrl: string | null
  textlessPosterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  logoColorGuess: string | null
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
  newSeasonReleased?: boolean
  newSeasonReleaseDate?: string | null
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

export interface MediaAssetOut {
  id: number
  assetType: string
  url: string
  width?: number | null
  height?: number | null
  lang?: string | null
  style?: string | null
  score?: number | null
  provider?: string | null
}

export interface FreePromotionItem {
  id: string
  store: string
  storeName: string
  title?: string
  description?: string | null
  originalPrice?: string | null
  discountPercentage?: number
  isFreeNow: boolean
  startDate?: string | null
  endDate?: string | null
  claimUrl?: string | null
  itemType?: string | null
  baseGameTitle?: string | null
}

export interface MediaItemDetail {
  id: string
  mediaType: string
  title: string
  slug: string
  overview: string | null
  freePromotions?: FreePromotionItem[]
  posterUrl: string | null
  textlessPosterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  logoColorGuess: string | null
  releaseDate: string | null
  popularity: number
  originalLanguage: string | null
  completenessScore: number
  avgRating?: number | null
  ratingCount: number
  overallRating?: number | null
  overallRatingSource?: string | null
  tmdbId?: string | null
  tvdbId?: string | null
  imdbId?: string | null
  likeCount: number
  watchlistCount: number
  watchedCount: number
  playedCount: number
  startedCount?: number
  listenedCount?: number
  viewCount: number
  isAdult?: boolean
  newSeasonReleased?: boolean
  newSeasonReleaseDate?: string | null
  userInteractions?: UserInteractionState | null
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  steamRtimeLastPlayed?: number | null
  youtubeVideoId?: string | null
  videos: Array<{ videoType?: string | null; url: string; provider?: string | null; providerId?: string | null }>
  screenshots?: MediaAssetOut[]
  createdAt: string
  updatedAt: string
  genres: Array<{ id: string; name: string; slug: string }>
  credits: Array<{
    id: string
    person: { id: string; name: string; photoUrl?: string }
    role: string
    characterName?: string
    sortOrder: number
  }>
  characters?: Array<{
    id: string
    character: {
      id: string
      name: string
      slug: string
      description?: string | null
      gender?: string | null
      species?: string | null
      mugShotUrl?: string | null
    }
    order: number
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
      isAdult: boolean
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
  imdbId?: string | null
}

export interface EpisodeOut {
  id: string
  episodeNumber: number
  name?: string | null
  overview?: string | null
  runtime?: number | null
  airDate?: string | null
  stillUrl?: string | null
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

/** Discover feed item shape for Trending Shows — a show's latest Season. */
export interface SeasonSummary {
  id: string
  showId: string
  showTitle: string
  seasonNumber: number
  name: string | null
  overview: string | null
  posterUrl: string | null
  airDate: string | null
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
  timeToBeat?: {
    hastly?: number | null
    normally?: number | null
    completely?: number | null
  } | null
}

export interface TrackOut {
  id: string
  trackNumber: number
  discNumber: number
  title: string
  durationMs?: number | null
  previewUrl?: string | null
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
  musicbrainzId?: string | null
  musicbrainzReleaseGroupId?: string | null
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
  avgRating: number | null
  ratingCount: number
  albumId: string
  albumTitle: string
  albumPosterUrl: string | null
  albumArtistName: string | null
  albumSlug: string
  mediaType?: 'track'
}

export interface MediaListResponse {
  items: MediaItemSummary[]
  tracks: TrackSearchResult[]
  nextCursor: string | null
  hasMore: boolean
  total?: number | null
  backfillPending?: boolean
}

/** DRF page envelope returned by ``GET /media/``. */
interface DrfMediaPage {
  count?: number
  next?: string | null
  previous?: string | null
  results?: MediaItemSummary[]
}

function normalizeMediaListPage(data: MediaListResponse | DrfMediaPage): MediaListResponse {
  if (data && Array.isArray((data as MediaListResponse).items)) {
    const page = data as MediaListResponse
    return {
      ...page,
      tracks: page.tracks ?? [],
      nextCursor: page.nextCursor ?? null,
      hasMore: Boolean(page.hasMore),
      total: page.total ?? null,
    }
  }
  const page = data as DrfMediaPage
  const items = Array.isArray(page.results) ? page.results : []
  return {
    items,
    tracks: [],
    nextCursor: null,
    hasMore: Boolean(page.next),
    total: typeof page.count === 'number' ? page.count : null,
  }
}

export type DecideRuntime = 'short' | 'medium' | 'long'

export interface DecideWatchParams {
  mediaTypes?: string[]
  genreIds?: Array<string | number>
  runtime?: DecideRuntime | null
  seed?: number
  limit?: number
}

export interface DecideWatchResponse {
  pick: MediaItemSummary | null
  shortlist: MediaItemSummary[]
  coldStart: boolean
}

export interface PersonSearchResult {
  id: string
  name: string
  photoUrl: string | null
  mediaType?: 'person'
}

export interface UserSearchResult {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  level: number
  levelTitle: string
  isAdmin: boolean
  mediaType?: 'user'
}

export interface StructuredSearchResponse {
  bestResults: Array<MediaItemSummary | PersonSearchResult | UserSearchResult | TrackSearchResult>
  movies: MediaItemSummary[]
  shows: MediaItemSummary[]
  games: MediaItemSummary[]
  music: MediaItemSummary[]
  tracks: TrackSearchResult[]
  people: PersonSearchResult[]
  users: UserSearchResult[]
  total: number
  moviesCount: number
  showsCount: number
  gamesCount: number
  musicCount: number
  tracksCount: number
  peopleCount: number
  usersCount: number
  backfillPending?: boolean
}

export const mediaQueries = {
  detail: (mediaType: string, id: string) =>
    queryOptions({
      queryKey: mediaKeys.detail(mediaType, id),
      queryFn: async () => {
        const { data } = await apiClient.get<MediaItemDetail>(`/media/${mediaType}/${id}`, {
          params: { theme: getResolvedTheme() },
        })
        return data
      },
      enabled: !!id,
      retry: 3,
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 60 * 24,
    }),

  list: (opts?: {
    type?: string
    genre?: string
    company?: string
    language?: string
    certification?: string
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
        // Catalog browse is DRF-paginated ({count, next, results}); use page_size.
        const params: Record<string, string | number | boolean> = {
          page_size: opts?.limit ?? 50,
          page: opts?.page ?? 1,
        }
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
        if (opts?.personId) {
          params.person_id = opts.personId
          if (opts?.creditRole) params.credit_role = opts.creditRole
        }
        const { data } = await apiClient.get<MediaListResponse | DrfMediaPage>('/media/', { params })
        return normalizeMediaListPage(data)
      },
      staleTime: 1000 * 60 * 5,
    }),

  infiniteList: (opts?: {
    type?: string
    genre?: string
    company?: string
    language?: string
    certification?: string
    isAnime?: boolean | null
    hasArtwork?: boolean
    sortBy?: string
    sortDir?: string
    limit?: number
  }) =>
    infiniteQueryOptions({
      queryKey: mediaKeys.infiniteList(opts?.type, opts),
      queryFn: async ({ pageParam }) => {
        // Catalog browse is DRF-paginated ({count, next, results}); use page_size.
        const params: Record<string, string | number | boolean> = {
          page_size: opts?.limit ?? 48,
          page: pageParam,
        }
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
        const { data } = await apiClient.get<MediaListResponse | DrfMediaPage>('/media/', { params })
        return normalizeMediaListPage(data)
      },
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.items.length) return undefined
        // Trust DRF's next link first.
        if (lastPage.hasMore) return allPages.length + 1
        const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0)
        if (typeof lastPage.total === 'number' && loaded >= lastPage.total) return undefined
        // Fallback when DRF omits `next` but this page looks full and count remains.
        const firstPageSize = allPages[0]?.items.length ?? 0
        if (
          typeof lastPage.total === 'number' &&
          loaded < lastPage.total &&
          firstPageSize > 0 &&
          lastPage.items.length >= firstPageSize
        ) {
          return allPages.length + 1
        }
        return undefined
      },
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
        const { data } = await apiClient.get<MediaListResponse>('/search', { params: searchParams })
        return data
      },
      getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
      initialPageParam: 1,
      staleTime: 1000 * 60 * 5,
      enabled: params.query.length > 0,
    }),

  structuredSearch: (query: string) =>
    queryOptions({
      queryKey: ['media', 'search', 'structured', query],
      queryFn: async () => {
        const { data } = await apiClient.get<StructuredSearchResponse>('/search/grouped', {
          params: { q: query, media_type_limit: 10, best_results_limit: 10 },
        })
        return data
      },
      staleTime: 1000 * 60 * 5,
      enabled: query.length > 0,
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
        const { data } = await apiClient.get<MediaListResponse>('/search/poll', { params: searchParams })
        return data
      },
      staleTime: 2000,
      enabled: params.query.length > 0,
    }),

  similar: (mediaType: string, id: string, opts?: { limit?: number }) =>
    queryOptions({
      queryKey: mediaKeys.similar(mediaType, id),
      queryFn: async () => {
        const params: Record<string, string | number> = { limit: opts?.limit ?? 20 }
        const { data } = await apiClient.get<MediaListResponse>(`/media/${mediaType}/${id}/similar`, { params })
        return data
      },
      staleTime: 1000 * 60 * 60 * 24, // 1 day — embeddings are deterministic
      gcTime: 1000 * 60 * 60 * 24 * 7, // keep in cache for 7 days
    }),

  recommendations: (mediaType: string, id: string, opts?: { limit?: number }) =>
    queryOptions({
      queryKey: mediaKeys.recommendations(mediaType, id),
      queryFn: async () => {
        const params: Record<string, number> = { limit: opts?.limit ?? 20 }
        const { data } = await apiClient.get<MediaListResponse>(`/media/${mediaType}/${id}/recommendations`, { params })
        return data
      },
      staleTime: 1000 * 60 * 60 * 24, // 1 day — embeddings are deterministic
      gcTime: 1000 * 60 * 60 * 24 * 7,
    }),

  decide: (opts: DecideWatchParams = {}) =>
    queryOptions({
      queryKey: mediaKeys.decide({
        mediaTypes: opts.mediaTypes,
        genreIds: opts.genreIds,
        runtime: opts.runtime ?? null,
        seed: opts.seed,
        limit: opts.limit,
      }),
      queryFn: async () => {
        const params: Record<string, string | number> = {
          limit: opts.limit ?? 5,
        }
        if (opts.mediaTypes?.length) {
          params.mediaTypes = opts.mediaTypes.join(',')
        }
        if (opts.genreIds?.length) {
          params.genreIds = opts.genreIds.join(',')
        }
        if (opts.runtime) {
          params.runtime = opts.runtime
        }
        if (opts.seed != null) {
          params.seed = opts.seed
        }
        const { data } = await apiClient.get<DecideWatchResponse>('/media/decide', { params })
        return data
      },
      staleTime: 0,
      gcTime: 1000 * 60 * 5,
    }),
  blockedRecommendations: () =>
    queryOptions({
      queryKey: mediaKeys.blockedRecommendations(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ items: MediaItemSummary[]; total: number }>(
          '/media/blocked-recommendations',
        )
        return data
      },
      staleTime: 1000 * 60,
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

export function useBlockRecommendation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      mediaId,
      mediaType,
    }: {
      mediaId: string | number
      mediaType?: string
    }) => {
      const url = mediaType
        ? `/media/${mediaType}/${mediaId}/block-recommendation`
        : `/media/${mediaId}/block-recommendation`
      const { data } = await apiClient.post<{
        blocked: boolean
        created: boolean
        mediaId: number
        title?: string
      }>(url)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.blockedRecommendations() })
      queryClient.invalidateQueries({ queryKey: [...mediaKeys.all(), 'decide'] })
      queryClient.invalidateQueries({ queryKey: [...mediaKeys.all(), 'recommendations'] })
    },
  })
}

export function useUnblockRecommendation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      mediaId,
      mediaType,
    }: {
      mediaId: string | number
      mediaType?: string
    }) => {
      const url = mediaType
        ? `/media/${mediaType}/${mediaId}/block-recommendation`
        : `/media/${mediaId}/block-recommendation`
      const { data } = await apiClient.delete<{
        blocked: boolean
        unblocked: boolean
        mediaId: number
      }>(url)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.blockedRecommendations() })
      queryClient.invalidateQueries({ queryKey: [...mediaKeys.all(), 'decide'] })
      queryClient.invalidateQueries({ queryKey: [...mediaKeys.all(), 'recommendations'] })
    },
  })
}

