import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
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
  userInteractions?: UserInteractionState | null
}

import type { UserInteractionState } from '@/features/interaction/interaction-queries'

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
  userInteractions?: UserInteractionState | null
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
    company: { id: string; name: string; slug: string }
    developer: boolean
    publisher: boolean
    porting: boolean
    supporting: boolean
  }>
  platforms: Array<{ id: string; platform: { id: string; name: string; slug: string; logoImageId?: string } }>
  gameModes: Array<{ id: string; gameMode: { id: string; name: string; slug: string } }>
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

export interface MediaListResponse {
  items: MediaItemSummary[]
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

  list: (type?: string) =>
    queryOptions({
      queryKey: mediaKeys.list(type),
      queryFn: async () => {
        const params: Record<string, string> = { limit: '50' }
        if (type) params.media_type = type
        const { data } = await apiClient.get<MediaListResponse>('/media', { params })
        return data
      },
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
}
