// TODO: Review this file
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"

interface AdminRecentUser {
  id: string
  username: string
  email: string
  createdAt: string
}

export interface EnrichmentCounts {
  total: number
  fanart: number
  omdb: number
  igdb: number
  steam: number
  steamgrid: number
  musicbrainz: number
  lastfm: number
  spotify: number
  embedding: number
  imdb: number
}

export interface AdminStats {
  totalUsers: number
  mediaCounts: Record<string, number>
  enrichment: Record<string, EnrichmentCounts>
  deltas: Record<string, EnrichmentCounts>
  stubCounts: { total: number }
  peopleCount: number
  recentUsers: AdminRecentUser[]
}

export const REFETCH_INTERVAL = 15_000

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data } = await apiClient.get<AdminStats>("/admin/stats")
      return data
    },
    staleTime: 10_000,
    refetchInterval: REFETCH_INTERVAL,
  })
}

export interface MetricPoint {
  label: string
  value: number
}

export interface AdminMetrics {
  metric: string
  hours: number
  data: MetricPoint[]
}

export function useAdminMetrics(metric: string, hours: number) {
  return useQuery({
    queryKey: ["admin", "metrics", metric, hours],
    queryFn: async () => {
      const { data } = await apiClient.get<AdminMetrics>("/admin/metrics", {
        params: { metric, hours },
      })
      return data
    },
    staleTime: 10_000,
    refetchInterval: REFETCH_INTERVAL,
  })
}

export interface MediaHydrationItem {
  id: string
  title: string
  mediaType: string
  slug: string

  hasOverview: boolean
  hasPoster: boolean
  hasBackdrop: boolean
  hasLogo: boolean
  hasTextlessPoster: boolean
  hasReleaseDate: boolean
  hasEmbedding: boolean
  hasOriginalLanguage: boolean

  hasGenres: boolean
  hasCredits: boolean
  hasExternalIds: boolean
  hasExternalRatings: boolean
  hasVideos: boolean
  hasAssets: boolean
  hasReleases: boolean
  hasKeywords: boolean
  hasCompanies: boolean
  hasWatchProviders: boolean

  hasRuntime: boolean | null
  hasCollection: boolean | null
  hasBudget: boolean | null
  hasShowStatus: boolean | null
  hasEpisodes: boolean | null
  hasPlatforms: boolean | null
  hasGameModes: boolean | null
  hasAgeRatings: boolean | null

  completenessScore: number
  syncedAt: string | null
  nextSyncAt: string | null
}

export interface MediaHydrationResponse {
  items: MediaHydrationItem[]
  total: number
  page: number
  perPage: number
}

export function useAdminHydration(params: Record<string, string | number>, queryKey: unknown[]) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<MediaHydrationResponse>("/admin/hydration", {
        params,
      })
      return data
    },
    staleTime: 10_000,
  })
}
